import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_1234567890123456';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/elp-yt-live-unit';
process.env.YOUTUBE_CLIENT_ID = 'test-client-id';
process.env.YOUTUBE_CLIENT_SECRET = 'test-client-secret';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/youtube/oauth/callback';
process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = 'youtube-token-encryption-key-ok';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  shouldAutoCreateYoutubeLive,
  youtubeWatchUrl,
  insertBindYoutubeLive,
  applyYoutubeLiveFields,
  publicYoutubeIngest,
  getBroadcastPlaybackInfo,
} = await import('../services/youtubeLiveApi.js');

test('shouldAutoCreateYoutubeLive skips when a URL was pasted', () => {
  assert.equal(
    shouldAutoCreateYoutubeLive({
      streamType: 'youtube',
      isOnline: true,
      streamUrl: 'https://youtu.be/dQw4w9WgXcQ',
    }),
    false
  );
});

test('shouldAutoCreateYoutubeLive skips when a broadcast already exists', () => {
  assert.equal(
    shouldAutoCreateYoutubeLive({
      streamType: 'youtube',
      isOnline: true,
      youtubeVideoId: '',
      streamUrl: '',
      youtubeBroadcastId: 'bcastLive1',
    }),
    false
  );
});

test('shouldAutoCreateYoutubeLive is true for YouTube dest without URL', () => {
  assert.equal(
    shouldAutoCreateYoutubeLive({
      streamType: 'youtube',
      isOnline: true,
      youtubeVideoId: '',
      streamUrl: '',
    }),
    true
  );
  assert.equal(
    shouldAutoCreateYoutubeLive({
      streamType: 'youtube_server',
      isOnline: true,
      youtubeVideoId: '',
      streamUrl: '',
    }),
    true
  );
});

test('shouldAutoCreateYoutubeLive does not run for server-only', () => {
  assert.equal(
    shouldAutoCreateYoutubeLive({
      streamType: 'server',
      isOnline: true,
    }),
    false
  );
});

test('youtubeWatchUrl builds a public watch URL from the broadcast id', () => {
  assert.equal(youtubeWatchUrl('abc123xyz01'), 'https://www.youtube.com/watch?v=abc123xyz01');
});

test('insertBindYoutubeLive creates, binds, and returns ingest (no tokens)', async () => {
  const youtube = {
    liveBroadcasts: {
      insert: async (params) => {
        assert.equal(params.requestBody.contentDetails.enableAutoStart, true);
        assert.equal(params.requestBody.contentDetails.enableAutoStop, false);
        return { data: { id: 'bcastLive1' } };
      },
      bind: async (params) => {
        assert.equal(params.id, 'bcastLive1');
        assert.equal(params.streamId, 'streamLive1');
        return { data: { id: 'bcastLive1' } };
      },
      update: async (params) => {
        assert.equal(params.requestBody.id, 'bcastLive1');
        assert.equal(params.requestBody.contentDetails.enableAutoStart, true);
        assert.equal(params.requestBody.contentDetails.enableAutoStop, false);
        assert.equal(params.requestBody.contentDetails.monitorStream.enableMonitorStream, false);
        return {
          data: {
            id: 'bcastLive1',
            status: { lifeCycleStatus: 'ready', privacyStatus: 'unlisted' },
          },
        };
      },
    },
    liveStreams: {
      insert: async () => ({
        data: {
          id: 'streamLive1',
          cdn: {
            ingestionInfo: {
              ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2',
              streamName: 'aaaa-bbbb-cccc-dddd',
            },
          },
        },
      }),
    },
  };

  const live = await insertBindYoutubeLive(youtube, { title: 'Ravi Priya Wedding' });
  assert.equal(live.broadcastId, 'bcastLive1');
  assert.equal(live.streamId, 'streamLive1');
  assert.equal(live.watchUrl, 'https://www.youtube.com/watch?v=bcastLive1');
  assert.equal(live.rtmpUrl, 'rtmp://a.rtmp.youtube.com/live2');
  assert.equal(live.streamKey, 'aaaa-bbbb-cccc-dddd');
  const json = JSON.stringify(publicYoutubeIngest(live));
  assert.equal(/access_token|refresh_token|client_secret/i.test(json), false);
});

test('applyYoutubeLiveFields stores watch URL and ids on the event payload', () => {
  const payload = {};
  applyYoutubeLiveFields(payload, {
    broadcastId: 'bcastLive1',
    streamId: 'streamLive1',
    watchUrl: 'https://www.youtube.com/watch?v=bcastLive1',
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: 'aaaa-bbbb-cccc-dddd',
  });
  assert.equal(payload.youtubeVideoId, 'bcastLive1');
  assert.equal(payload.youtubeBroadcastId, 'bcastLive1');
  assert.equal(payload.youtubeLiveStreamId, 'streamLive1');
  assert.equal(payload.streamUrl, 'https://www.youtube.com/watch?v=bcastLive1');
  assert.equal(payload.youtubeStreamKey, 'aaaa-bbbb-cccc-dddd');
});

test('getBroadcastPlaybackInfo returns null without an id', async () => {
  assert.equal(await getBroadcastPlaybackInfo('user1', ''), null);
});
