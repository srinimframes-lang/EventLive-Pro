/**
 * Cloudflare R2 storage (S3-compatible API) — backend only.
 * Used for stream recordings, gallery images, and optional backups.
 *
 * Required env (canonical names used in this project):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 * Optional:
 *   R2_ENDPOINT     (default https://<account-id>.r2.cloudflarestorage.com)
 *   R2_PUBLIC_BASE  (r2.dev or custom-domain base for public object URLs)
 *
 * Accepted aliases (same values — do not set both conflicting values):
 *   R2_BUCKET_NAME  → R2_BUCKET
 *   R2_PUBLIC_URL   → R2_PUBLIC_BASE
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Load .env if present (no-op when vars already come from the host / Render).
dotenv.config();

let client = null;
let clientFingerprint = '';

function trim(value) {
  return String(value || '').trim();
}

function trimBase(value) {
  return trim(value).replace(/\/+$/, '');
}

/** Resolve R2 settings from env (lazy — always current). */
export function getR2Config() {
  const accountId = trim(process.env.R2_ACCOUNT_ID);
  const accessKeyId = trim(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = trim(process.env.R2_SECRET_ACCESS_KEY);
  const bucket = trim(process.env.R2_BUCKET || process.env.R2_BUCKET_NAME);
  const publicBase = trimBase(process.env.R2_PUBLIC_BASE || process.env.R2_PUBLIC_URL);
  const endpoint = trimBase(
    process.env.R2_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
  );

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    publicBase,
  };
}

/** @returns {string[]} missing required env key names (canonical names only). */
export function getR2MissingEnvKeys() {
  const c = getR2Config();
  const missing = [];
  if (!c.accountId) missing.push('R2_ACCOUNT_ID');
  if (!c.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!c.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!c.bucket) missing.push('R2_BUCKET');
  return missing;
}

export function isR2Configured() {
  return getR2MissingEnvKeys().length === 0;
}

/**
 * Safe status for Super Admin UI (never includes secrets).
 * @returns {{ configured: boolean, missing: string[], bucket: string, hasPublicBase: boolean, endpointHost: string }}
 */
export function getR2Status() {
  const c = getR2Config();
  const missing = getR2MissingEnvKeys();
  let endpointHost = '';
  try {
    endpointHost = c.endpoint ? new URL(c.endpoint).host : '';
  } catch {
    endpointHost = '';
  }
  return {
    configured: missing.length === 0,
    missing,
    bucket: c.bucket ? `${c.bucket.slice(0, 2)}…` : '',
    bucketName: c.bucket || '',
    hasPublicBase: Boolean(c.publicBase),
    endpointHost,
  };
}

function getClient() {
  if (!isR2Configured()) return null;
  const c = getR2Config();
  const fingerprint = `${c.endpoint}|${c.accessKeyId}|${c.bucket}`;
  if (!client || clientFingerprint !== fingerprint) {
    client = new S3Client({
      region: 'auto',
      endpoint: c.endpoint,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
      // R2 compatibility: avoid aws-chunked CRC checksum framing on uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    clientFingerprint = fingerprint;
  }
  return client;
}

/** Bucket name (empty when unset). */
export function getR2Bucket() {
  return getR2Config().bucket;
}

/** Canonical (private) object URL stored in MongoDB for reference. */
export function r2ObjectUrl(key) {
  if (!key) return '';
  const c = getR2Config();
  if (!c.endpoint || !c.bucket) return '';
  return `${c.endpoint}/${c.bucket}/${key}`;
}

/** Direct public URL when the bucket is exposed via r2.dev / custom domain. */
export function r2PublicUrl(key) {
  if (!key) return '';
  const c = getR2Config();
  if (!c.publicBase) return '';
  return `${c.publicBase}/${key}`;
}

/** Upload a local file to R2 and verify size. Used for recordings and gallery. */
export async function uploadFileToR2(localPath, key, contentType = 'application/octet-stream') {
  const s3 = getClient();
  if (!s3) {
    const missing = getR2MissingEnvKeys();
    throw new Error(
      missing.length
        ? `R2 is not configured (missing: ${missing.join(', ')})`
        : 'R2 is not configured'
    );
  }

  const abs = path.resolve(localPath);
  const stat = fs.statSync(abs);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`File invalid: ${abs}`);
  }

  const bucket = getR2Bucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(abs),
      ContentType: contentType,
      ContentLength: stat.size,
    })
  );

  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const remoteSize = Number(head.ContentLength || 0);
  if (remoteSize !== stat.size) {
    throw new Error(
      `R2 verification failed for ${key}: local ${stat.size} bytes vs remote ${remoteSize} bytes`
    );
  }

  return {
    key,
    url: r2PublicUrl(key) || r2ObjectUrl(key),
    objectUrl: r2ObjectUrl(key),
    publicUrl: r2PublicUrl(key),
    size: stat.size,
  };
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
    Bucket: getR2Bucket(),
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

/**
 * HEAD an R2 object. Used before deleting a local VPS copy.
 * Throws on network/auth errors so callers skip delete instead of guessing.
 */
export async function headR2Object(key) {
  const s3 = getClient();
  if (!s3 || !key) return { exists: false, size: 0 };
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    return { exists: true, size: Number(head.ContentLength || 0) };
  } catch (err) {
    const status = Number(err?.$metadata?.httpStatusCode || 0);
    const name = String(err?.name || '');
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') {
      return { exists: false, size: 0 };
    }
    throw err;
  }
}

export async function deleteR2Object(key) {
  const s3 = getClient();
  if (!s3 || !key) return false;
  await s3.send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }));
  return true;
}

export async function deleteRecordingFromR2(key) {
  return deleteR2Object(key);
}

/** Download an R2 object to a local path (used when merging parts already migrated). */
export async function downloadR2ObjectToFile(key, destPath) {
  const s3 = getClient();
  if (!s3 || !key) throw new Error('R2 download unavailable');
  const abs = path.resolve(destPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const res = await s3.send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
  if (!res.Body) throw new Error(`empty R2 body for ${key}`);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(abs);
    out.on('error', reject);
    out.on('finish', resolve);
    if (typeof res.Body.pipe === 'function') {
      res.Body.pipe(out);
      res.Body.on('error', reject);
    } else {
      reject(new Error('unsupported R2 body stream'));
    }
  });
  return abs;
}
