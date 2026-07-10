import { Event } from '../models/Event.js';
import { syncEventQrCode } from './eventQr.js';

/** Reload event after write to confirm MongoDB persistence. */
export async function loadVerifiedEvent(eventId) {
  const doc = await Event.findById(eventId).populate('organizer', 'name email');
  if (!doc) {
    throw new Error('Event save verification failed — document not found after write');
  }
  return doc;
}

/** Fire-and-forget QR sync so save responses are not blocked. */
export function scheduleEventQrSync(eventId) {
  syncEventQrCode(eventId).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[events] QR sync failed for ${eventId}:`, err.message);
  });
}
