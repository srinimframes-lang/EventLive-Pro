import crypto from 'crypto';
import { env } from '../config/env.js';
import { YoutubeOauthState, STATE_TTL_MS } from '../models/YoutubeOauthState.js';
import { YoutubeCredential } from '../models/YoutubeCredential.js';
import {
  encryptYoutubeToken,
  decryptYoutubeToken,
  youtubeTokenEncryptionReady,
} from './youtubeTokenCrypto.js';
import {
  YOUTUBE_OAUTH_SCOPES,
  getYoutubeGoogleAdapter,
} from './youtubeGoogle.js';

export { YOUTUBE_OAUTH_SCOPES, STATE_TTL_MS };

const ALLOWED_RETURN_TO = new Set(['/dashboard', '/admin', '/reseller', '/live-links/new']);

export function youtubeOauthConfigured() {
  return Boolean(
    env.youtube?.clientId &&
      env.youtube?.clientSecret &&
      env.youtube?.redirectUri &&
      youtubeTokenEncryptionReady()
  );
}

export function defaultReturnToForUser(user) {
  const role = user?.role;
  if (role === 'admin' || role === 'superadmin') return '/admin';
  if (role === 'subadmin') return '/reseller';
  return '/dashboard';
}

export function sanitizeReturnTo(value, user) {
  const raw = String(value || '').trim();
  if (ALLOWED_RETURN_TO.has(raw)) return raw;
  return defaultReturnToForUser(user);
}

export function frontendOAuthRedirectUrl(returnTo, params = {}) {
  const path = sanitizeReturnTo(returnTo);
  const origin = env.isProd
    ? 'https://eventlivepro.com'
    : env.clientUrls.find((u) => /localhost|127\.0\.0\.1/i.test(u)) ||
      env.clientUrl ||
      'http://localhost:5173';
  const url = new URL(path, `${String(origin).replace(/\/+$/, '')}/`);
  Object.entries(params).forEach(([key, val]) => {
    if (val != null && val !== '') url.searchParams.set(key, String(val));
  });
  return url.toString();
}

export function mapOauthCallbackError(query = {}) {
  const err = String(query.error || '').toLowerCase();
  if (err === 'access_denied') return 'denied';
  if (err) return 'google';
  return '';
}

export function publicYoutubeStatus(doc) {
  if (!doc || !doc.connected) {
    return { connected: false, channelId: '', channelTitle: '' };
  }
  return {
    connected: true,
    channelId: doc.channelId || '',
    channelTitle: doc.channelTitle || '',
  };
}

function assertNoSecrets(payload) {
  const text = JSON.stringify(payload);
  if (/access_token|refresh_token|client_secret/i.test(text)) {
    throw new Error('Refusing to expose YouTube secrets');
  }
  return payload;
}

export function safeYoutubeStatusPayload(doc) {
  return assertNoSecrets(publicYoutubeStatus(doc));
}

function oauthClient() {
  const g = getYoutubeGoogleAdapter();
  const client = g.createClient({
    clientId: env.youtube.clientId,
    clientSecret: env.youtube.clientSecret,
    redirectUri: env.youtube.redirectUri,
  });
  return { g, client };
}

export async function createOauthState(userId, returnTo) {
  const state = crypto.randomBytes(32).toString('hex');
  await YoutubeOauthState.create({
    state,
    user: userId,
    returnTo: sanitizeReturnTo(returnTo),
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  return state;
}

export async function consumeOauthState(stateValue) {
  const value = String(stateValue || '').trim();
  if (!value) {
    const err = new Error('invalid_state');
    err.code = 'invalid_state';
    throw err;
  }
  const row = await YoutubeOauthState.findOne({ state: value });
  if (!row) {
    const err = new Error('invalid_state');
    err.code = 'invalid_state';
    throw err;
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await YoutubeOauthState.deleteOne({ _id: row._id });
    const err = new Error('expired_state');
    err.code = 'expired_state';
    throw err;
  }
  await YoutubeOauthState.deleteOne({ _id: row._id });
  return row;
}

export function buildGoogleAuthUrl(state) {
  const { g, client } = oauthClient();
  return g.generateAuthUrl(client, {
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: YOUTUBE_OAUTH_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code) {
  const { g, client } = oauthClient();
  const tokens = await g.getToken(client, code);
  client.setCredentials(tokens);
  let channel = { channelId: '', channelTitle: '', googleAccountId: '' };
  try {
    channel = await g.getMineChannel(client);
  } catch {
    channel = { channelId: '', channelTitle: '', googleAccountId: '' };
  }
  return { tokens, channel, client };
}

export async function persistYoutubeTokens(userId, { tokens, channel }) {
  const access = tokens?.access_token ? encryptYoutubeToken(tokens.access_token) : '';
  const refresh = tokens?.refresh_token ? encryptYoutubeToken(tokens.refresh_token) : '';
  const expiry = tokens?.expiry_date ? new Date(tokens.expiry_date) : null;
  const scopes = Array.isArray(tokens?.scope)
    ? tokens.scope
    : String(tokens?.scope || '')
        .split(/\s+/)
        .filter(Boolean);
  const scopeList = scopes.length ? scopes : [...YOUTUBE_OAUTH_SCOPES];

  const existing = await YoutubeCredential.findOne({ user: userId }).select(
    '+refreshTokenEnc +accessTokenEnc'
  );

  if (!refresh && !existing?.refreshTokenEnc) {
    const err = new Error('missing_refresh_token');
    err.code = 'missing_refresh_token';
    throw err;
  }

  const payload = {
    user: userId,
    googleAccountId: channel?.googleAccountId || channel?.channelId || existing?.googleAccountId || '',
    channelId: channel?.channelId || existing?.channelId || '',
    channelTitle: channel?.channelTitle || existing?.channelTitle || '',
    accessTokenEnc: access || existing?.accessTokenEnc || '',
    refreshTokenEnc: refresh || existing?.refreshTokenEnc || '',
    accessTokenExpiresAt: expiry || existing?.accessTokenExpiresAt || null,
    scopes: scopeList,
    connected: true,
  };

  const doc = await YoutubeCredential.findOneAndUpdate(
    { user: userId },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

export async function loadUserCredential(userId, { withSecrets = false } = {}) {
  const query = YoutubeCredential.findOne({ user: userId });
  if (withSecrets) query.select('+refreshTokenEnc +accessTokenEnc');
  return query;
}

export async function disconnectUserYoutube(userId) {
  const cred = await YoutubeCredential.findOne({ user: userId }).select(
    '+refreshTokenEnc +accessTokenEnc'
  );
  if (!cred) return { disconnected: false };

  try {
    const refresh = cred.refreshTokenEnc ? decryptYoutubeToken(cred.refreshTokenEnc) : '';
    const access = cred.accessTokenEnc ? decryptYoutubeToken(cred.accessTokenEnc) : '';
    const { g, client } = oauthClient();
    await g.revokeToken(client, refresh || access);
  } catch {
    // Revoke is best-effort; still delete local credentials.
  }

  await YoutubeCredential.deleteOne({ _id: cred._id, user: userId });
  return { disconnected: true };
}

export async function applyRefreshedTokens(userId, tokens) {
  if (!tokens) return;
  const update = {};
  if (tokens.access_token) update.accessTokenEnc = encryptYoutubeToken(tokens.access_token);
  if (tokens.refresh_token) update.refreshTokenEnc = encryptYoutubeToken(tokens.refresh_token);
  if (tokens.expiry_date) update.accessTokenExpiresAt = new Date(tokens.expiry_date);
  if (!Object.keys(update).length) return;
  await YoutubeCredential.updateOne({ user: userId }, { $set: update });
}
