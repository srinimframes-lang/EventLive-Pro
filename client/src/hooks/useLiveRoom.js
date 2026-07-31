import { useCallback, useEffect, useRef, useState } from 'react';
import { createSocket } from '../services/socket.js';
import { streamService } from '../services/stream.service.js';

/**
 * Manages the realtime "live room" for an event: socket connection, viewer
 * count, chat messages, and Q&A — plus initial history loaded over REST.
 *
 * @param {string} eventId
 * @param {{ guestName?: string }} [options]
 */
export function useLiveRoom(eventId, { guestName } = {}) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [messages, setMessages] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [liveStatus, setLiveStatus] = useState(null);
  const [playerNonce, setPlayerNonce] = useState(0);
  const [failoverNotice, setFailoverNotice] = useState(null);
  const [failoverState, setFailoverState] = useState(null);

  // Load initial history once per event.
  useEffect(() => {
    if (!eventId) return;
    let active = true;
    Promise.all([
      streamService.getChatHistory(eventId).catch(() => []),
      streamService.getQuestions(eventId).catch(() => []),
    ]).then(([chat, qa]) => {
      if (!active) return;
      setMessages(chat);
      setQuestions(qa);
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  // Connect + join the room.
  useEffect(() => {
    if (!eventId) return undefined;
    const socket = createSocket();
    socketRef.current = socket;

    const sortQuestions = (list) =>
      [...list].sort((a, b) => {
        if (a.isAnswered !== b.isAnswered) return a.isAnswered ? 1 : -1;
        if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('room:join', { eventId, guestName }, (res) => {
        if (res?.ok) setViewers(res.viewers);
      });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('presence:viewers', ({ eventId: id, count }) => {
      if (id === eventId) setViewers(count);
    });
    socket.on('chat:message', (message) => {
      setMessages((prev) => [...prev.slice(-199), message]);
    });
    socket.on('qa:question', (question) => {
      setQuestions((prev) => sortQuestions([...prev, question]));
    });
    socket.on('qa:updated', (updated) => {
      setQuestions((prev) =>
        sortQuestions(prev.map((q) => (q.id === updated.id ? updated : q)))
      );
    });
    socket.on('stream:status', (status) => {
      setLiveStatus(status);
      // Remount only when entering recorded replay — not during reconnect grace.
      if (status?.reconnecting) return;
      if (status && status.isLive === false && status.recordingUrl) {
        setPlayerNonce((n) => n + 1);
      }
    });
    socket.on('stream:restart', () => setPlayerNonce((n) => n + 1));

    const applyFailoverPayload = (payload) => {
      if (!payload || payload.eventId !== eventId) return;
      setFailoverState(payload);
      setLiveStatus((prev) => ({
        ...(prev || {}),
        failoverFeatureEnabled: payload.failoverFeatureEnabled,
        activeSource: payload.activeSource,
        backupStatus: payload.backupStatus,
        backupYoutubeVideoId: payload.backupYoutubeVideoId,
        failoverPlaybackMode: payload.failoverPlaybackMode,
        emergencyOverride: payload.emergencyOverride,
      }));
    };

    socket.on('stream:failover', (payload) => {
      applyFailoverPayload(payload);
      setFailoverNotice(
        payload?.message || 'Server issue detected. Switching to backup stream...'
      );
      setPlayerNonce((n) => n + 1);
    });
    socket.on('stream:server-recovered', (payload) => {
      applyFailoverPayload(payload);
    });
    socket.on('stream:playback-mode', (payload) => {
      applyFailoverPayload(payload);
      setPlayerNonce((n) => n + 1);
    });

    return () => {
      socket.emit('room:leave');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [eventId, guestName]);

  const sendMessage = useCallback((text) => {
    const body = text?.trim();
    if (!body || !socketRef.current) return;
    socketRef.current.emit('chat:send', { text: body });
  }, []);

  const askQuestion = useCallback((text) => {
    const body = text?.trim();
    if (!body || !socketRef.current) return;
    socketRef.current.emit('qa:ask', { text: body });
  }, []);

  const upvoteQuestion = useCallback((questionId) => {
    socketRef.current?.emit('qa:upvote', { questionId });
  }, []);

  const answerQuestion = useCallback((questionId, answer) => {
    socketRef.current?.emit('qa:answer', { questionId, answer });
  }, []);

  const clearFailoverNotice = useCallback(() => setFailoverNotice(null), []);

  return {
    connected,
    viewers,
    messages,
    questions,
    liveStatus,
    playerNonce,
    failoverNotice,
    failoverState,
    clearFailoverNotice,
    sendMessage,
    askQuestion,
    upvoteQuestion,
    answerQuestion,
  };
}
