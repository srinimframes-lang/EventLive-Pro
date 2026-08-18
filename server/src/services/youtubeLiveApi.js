/**
 * Reusable YouTube Data / Live Streaming API helpers.
 * OAuth connect does NOT create broadcasts — call these later from live-link code.
 */
import { env } from '../config/env.js';
import {
  loadUserCredential,
  applyRefreshedTokens,
} from './youtubeOauth.js';
import { decryptYoutubeToken } from './youtubeTokenCrypto.js';
import { getYoutubeGoogleAdapter } from './youtubeGoogle.js';

async function authorizedClientForUser(userId) {
  const cred = await loadUserCredential(userId, { withSecrets: true });
  if (!cred || !cred.connected || !cred.refreshTokenEnc) {
    const err = new Error('YouTube is not connected for this account');
    err.code = 'youtube_not_connected';
    err.statusCode = 400;
    throw err;
  }
  const g = getYoutubeGoogleAdapter();
  const client = g.createClient({
    clientId: env.youtube.clientId,
    clientSecret: env.youtube.clientSecret,
    redirectUri: env.youtube.redirectUri,
  });
  client.setCredentials({
    access_token: cred.accessTokenEnc ? decryptYoutubeToken(cred.accessTokenEnc) : '',
    refresh_token: decryptYoutubeToken(cred.refreshTokenEnc),
    expiry_date: cred.accessTokenExpiresAt ? cred.accessTokenExpiresAt.getTime() : undefined,
  });
  if (typeof client.on === 'function') {
    client.on('tokens', (tokens) => {
      applyRefreshedTokens(userId, tokens).catch(() => {});
    });
  }
  return { client, youtube: g.youtubeClient(client), credential: cred };
}

export async function getYoutubeApiForUser(userId) {
  return authorizedClientForUser(userId);
}

export async function liveBroadcastsInsert(userId, resource) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.insert(resource);
}

export async function liveStreamsInsert(userId, resource) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveStreams.insert(resource);
}

export async function liveBroadcastsBind(userId, params) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.bind(params);
}

export async function liveBroadcastsUpdate(userId, resource) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.update(resource);
}

export async function liveBroadcastsList(userId, params = {}) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.list({
    part: ['id', 'snippet', 'status', 'contentDetails'],
    mine: true,
    ...params,
  });
}

export async function liveStreamsList(userId, params = {}) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveStreams.list({
    part: ['id', 'snippet', 'cdn', 'status'],
    mine: true,
    ...params,
  });
}

export async function liveBroadcastsTransition(userId, params) {
  const { youtube } = await authorizedClientForUser(userId);
  return youtube.liveBroadcasts.transition(params);
}
