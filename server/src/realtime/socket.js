import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Question } from '../models/Question.js';
import { canManageEvent } from '../utils/ownership.js';

const roomKey = (eventId) => `event:${eventId}`;

// In-memory presence: eventId -> Set<socketId>
const viewers = new Map();

function viewerCount(eventId) {
  return viewers.get(eventId)?.size || 0;
}

function addViewer(eventId, socketId) {
  if (!viewers.has(eventId)) viewers.set(eventId, new Set());
  viewers.get(eventId).add(socketId);
}

function removeViewer(eventId, socketId) {
  const set = viewers.get(eventId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) viewers.delete(eventId);
}

function clean(str, max) {
  return String(str ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Creates and wires up the Socket.IO server.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.clientUrls, credentials: true },
  });

  // Optional auth: a valid token attaches the user; otherwise stay anonymous.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        const decoded = jwt.verify(token, env.jwt.secret);
        const user = await User.findById(decoded.id);
        if (user) {
          socket.user = { id: user.id, name: user.name, role: user.role };
        }
      }
    } catch {
      // Ignore invalid tokens — proceed as a guest.
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.data.eventId = null;
    socket.data.displayName = socket.user?.name || 'Guest';

    const emitViewers = (eventId) => {
      io.to(roomKey(eventId)).emit('presence:viewers', {
        eventId,
        count: viewerCount(eventId),
      });
    };

    socket.on('room:join', async ({ eventId, guestName } = {}, ack) => {
      try {
        const event = await Event.findById(eventId).select('_id organizer');
        if (!event) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Event not found' });
          return;
        }

        socket.data.eventId = String(event._id);
        if (!socket.user && guestName) {
          socket.data.displayName = clean(guestName, 60) || 'Guest';
        }

        socket.join(roomKey(socket.data.eventId));
        addViewer(socket.data.eventId, socket.id);
        emitViewers(socket.data.eventId);

        // Best-effort peak tracking.
        const count = viewerCount(socket.data.eventId);
        Event.updateOne(
          { _id: socket.data.eventId, peakViewers: { $lt: count } },
          { peakViewers: count }
        ).catch(() => {});

        if (typeof ack === 'function') {
          ack({ ok: true, viewers: count, displayName: socket.data.displayName });
        }
      } catch {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to join' });
      }
    });

    socket.on('chat:send', async ({ text } = {}, ack) => {
      const eventId = socket.data.eventId;
      const body = clean(text, 1000);
      if (!eventId || !body) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid message' });
        return;
      }
      try {
        const message = await ChatMessage.create({
          event: eventId,
          user: socket.user?.id || null,
          name: socket.data.displayName,
          text: body,
        });
        io.to(roomKey(eventId)).emit('chat:message', message.toJSON());
        if (typeof ack === 'function') ack({ ok: true });
      } catch {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to send' });
      }
    });

    socket.on('qa:ask', async ({ text } = {}, ack) => {
      const eventId = socket.data.eventId;
      const body = clean(text, 500);
      if (!eventId || !body) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid question' });
        return;
      }
      try {
        const question = await Question.create({
          event: eventId,
          user: socket.user?.id || null,
          name: socket.data.displayName,
          text: body,
        });
        io.to(roomKey(eventId)).emit('qa:question', question.toJSON());
        if (typeof ack === 'function') ack({ ok: true });
      } catch {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to ask' });
      }
    });

    socket.on('qa:upvote', async ({ questionId } = {}, ack) => {
      const eventId = socket.data.eventId;
      if (!eventId || !questionId) return;
      const voterId = socket.user?.id || socket.id;
      try {
        const question = await Question.findOneAndUpdate(
          { _id: questionId, event: eventId, upvoters: { $ne: voterId } },
          { $inc: { upvotes: 1 }, $push: { upvoters: voterId } },
          { new: true }
        );
        if (question) {
          io.to(roomKey(eventId)).emit('qa:updated', question.toJSON());
        }
        if (typeof ack === 'function') ack({ ok: Boolean(question) });
      } catch {
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    socket.on('qa:answer', async ({ questionId, answer } = {}, ack) => {
      const eventId = socket.data.eventId;
      const body = clean(answer, 2000);
      if (!eventId || !questionId) return;
      try {
        const event = await Event.findById(eventId).select('_id organizer');
        if (!event || !socket.user || !canManageEvent(event, { _id: socket.user.id, role: socket.user.role })) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Not authorized' });
          return;
        }
        const question = await Question.findOneAndUpdate(
          { _id: questionId, event: eventId },
          { answer: body, isAnswered: true, answeredAt: new Date() },
          { new: true }
        );
        if (question) io.to(roomKey(eventId)).emit('qa:updated', question.toJSON());
        if (typeof ack === 'function') ack({ ok: Boolean(question) });
      } catch {
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    socket.on('room:leave', () => {
      const eventId = socket.data.eventId;
      if (eventId) {
        socket.leave(roomKey(eventId));
        removeViewer(eventId, socket.id);
        emitViewers(eventId);
        socket.data.eventId = null;
      }
    });

    socket.on('disconnect', () => {
      const eventId = socket.data.eventId;
      if (eventId) {
        removeViewer(eventId, socket.id);
        emitViewers(eventId);
      }
    });
  });

  return io;
}
