import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloudflare R2 storage for event recordings (S3-compatible API).
 *
 * Required env:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Optional:
 *   R2_ENDPOINT     (default https://<account-id>.r2.cloudflarestorage.com)
 *   R2_PUBLIC_BASE  (r2.dev or custom-domain base for direct public playback)
 */
const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID || '').trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID || '').trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
export const R2_BUCKET = (process.env.R2_BUCKET || '').trim();
const R2_ENDPOINT = (
  process.env.R2_ENDPOINT ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')
)
  .trim()
  .replace(/\/+$/, '');
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || '').trim().replace(/\/+$/, '');

let client = null;

export function isR2Configured() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

function getClient() {
  if (!isR2Configured()) return null;
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      // R2 compatibility: avoid aws-chunked CRC checksum framing on uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

/** Canonical (private) object URL stored in MongoDB for reference. */
export function r2ObjectUrl(key) {
  if (!key) return '';
  return `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
}

/** Direct public URL when the bucket is exposed via r2.dev / custom domain. */
export function r2PublicUrl(key) {
  if (!key || !R2_PUBLIC_BASE) return '';
  return `${R2_PUBLIC_BASE}/${key}`;
}

/** Upload a local file to R2 and verify size. Used for recordings and gallery. */
export async function uploadFileToR2(localPath, key, contentType = 'application/octet-stream') {
  const s3 = getClient();
  if (!s3) throw new Error('R2 is not configured');

  const abs = path.resolve(localPath);
  const stat = fs.statSync(abs);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`File invalid: ${abs}`);
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: fs.createReadStream(abs),
      ContentType: contentType,
      ContentLength: stat.size,
    })
  );

  const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const remoteSize = Number(head.ContentLength || 0);
  if (remoteSize !== stat.size) {
    throw new Error(
      `R2 verification failed for ${key}: local ${stat.size} bytes vs remote ${remoteSize} bytes`
    );
  }

  return { key, url: r2ObjectUrl(key), size: stat.size };
}

/**
 * Upload a local recording to R2 and verify the stored object size matches.
 * Returns { key, url, size } on success; throws on any failure.
 */
export async function uploadRecordingToR2(localPath, key) {
  return uploadFileToR2(localPath, key, 'video/mp4');
}

/** Presigned GET URL (default 1h) for playback/download from a private bucket. */
export async function presignR2Url(key, { expiresIn = 3600, downloadFilename = '' } = {}) {
  const s3 = getClient();
  if (!s3 || !key) return '';
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ...(downloadFilename
      ? { ResponseContentDisposition: `attachment; filename="${downloadFilename}"` }
      : {}),
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/** @deprecated alias — recordings use the shared presigner */
export async function presignRecordingUrl(key, opts = {}) {
  return presignR2Url(key, opts);
}

export async function deleteR2Object(key) {
  const s3 = getClient();
  if (!s3 || !key) return false;
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return true;
}

export async function deleteRecordingFromR2(key) {
  return deleteR2Object(key);
}
