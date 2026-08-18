/**
 * Thin wrapper around googleapis so OAuth + Live API can be tested without
 * hitting Google. Tests may replace methods via setYoutubeGoogleAdapter().
 */
import { google } from 'googleapis';

export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

const defaultAdapter = {
  createClient({ clientId, clientSecret, redirectUri }) {
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  },
  generateAuthUrl(client, opts) {
    return client.generateAuthUrl(opts);
  },
  async getToken(client, code) {
    const { tokens } = await client.getToken(code);
    return tokens || {};
  },
  async getMineChannel(client) {
    const youtube = google.youtube({ version: 'v3', auth: client });
    const res = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
      maxResults: 1,
    });
    const item = res?.data?.items?.[0];
    if (!item) return { channelId: '', channelTitle: '', googleAccountId: '' };
    return {
      channelId: item.id || '',
      channelTitle: item.snippet?.title || '',
      googleAccountId: item.id || '',
    };
  },
  async revokeToken(client, token) {
    if (!token) return;
    await client.revokeToken(token);
  },
  youtubeClient(auth) {
    return google.youtube({ version: 'v3', auth });
  },
};

let adapter = defaultAdapter;

export function getYoutubeGoogleAdapter() {
  return adapter;
}

export function setYoutubeGoogleAdapter(next) {
  adapter = next ? { ...defaultAdapter, ...next } : defaultAdapter;
}

export function resetYoutubeGoogleAdapter() {
  adapter = defaultAdapter;
}
