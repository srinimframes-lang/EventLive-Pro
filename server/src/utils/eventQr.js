import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { Event } from '../models/Event.js';
import { Domain } from '../models/Domain.js';
import { Settings } from '../models/Settings.js';
import { getSiteUrl, watchPath } from './seo.js';
import { removeUpload } from './storage.js';
import { UPLOADS_DIR } from '../middleware/upload.middleware.js';

export async function resolveEventBrandDomain(organizerId) {
  if (!organizerId) return '';
  const dom = await Domain.findOne({ customer: organizerId, status: 'active' })
    .select('host')
    .lean();
  return dom?.host || '';
}

/** Canonical public watch URL used inside QR codes. */
export async function buildEventPublicWatchUrl(eventLike, settings, brandDomain = '') {
  const settingsDoc = settings || (await Settings.getSingleton());
  const origin = brandDomain
    ? `https://${brandDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : getSiteUrl(settingsDoc);
  const base = origin.replace(/\/+$/, '');
  const pathPart = watchPath(eventLike);
  return `${base}${pathPart}`;
}

export async function generateQrPngBuffer(text) {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1e1b4b', light: '#ffffff' },
  });
}

async function writeQrToUploads(buffer) {
  const filename = `qr-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.png`;
  const filePath = path.join(UPLOADS_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/${filename}`;
}

/**
 * Generate (or reuse) a stored QR image for an event's public live URL.
 * Skips work when the encoded URL has not changed.
 */
export async function syncEventQrCode(eventId) {
  const event = await Event.findById(eventId);
  if (!event) return null;

  const settings = await Settings.getSingleton();
  const brandDomain = await resolveEventBrandDomain(event.organizer);
  const targetUrl = await buildEventPublicWatchUrl(event, settings, brandDomain);

  if (!event.shortCode && !event.slug) {
    return null;
  }

  if (event.qrCodeTargetUrl === targetUrl && event.qrCodeImage) {
    return { targetUrl, qrCodeImage: event.qrCodeImage };
  }

  const buffer = await generateQrPngBuffer(targetUrl);
  const qrCodeImage = await writeQrToUploads(buffer);

  if (event.qrCodeImage && event.qrCodeImage !== qrCodeImage) {
    await removeUpload(event.qrCodeImage);
  }

  await Event.findByIdAndUpdate(eventId, {
    qrCodeImage,
    qrCodeTargetUrl: targetUrl,
  });

  return { targetUrl, qrCodeImage };
}
