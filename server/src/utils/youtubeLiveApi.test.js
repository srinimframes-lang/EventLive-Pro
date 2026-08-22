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
  applyManualYoutubeFields,
  publicYoutubeIngest,
  getBroadcastPlaybackInfo,
  eventYoutubeLookupId,
  selectLiveYoutubePlayback,
  youtubeOauthUserIds,
  activeLiveBroadcastListParams,
  resolveYoutubeInput,
  youtubeDocFields,
  provisionYoutubeLiveIfNeeded,
  describeYoutubeApiError,
  wrapYoutubeError,
  isYoutubeQuotaExceeded,
} = await import('../services/youtubeLiveApi.js');
const { extractYouTubeId } = await import('./youtube.js');

test('shouldAutoCreateYoutubeLive skips when a /live/ URL was pasted', () => {
  assert.equal(
    shouldAutoCreateYoutubeLive({
      streamType: 'youtube',
      isOnline: true,
      streamUrl: 'https://www.youtube.com/live/882LagGGVM4',
    }),
    false
  );
  assert.equal(
    shouldAutoCreateYoutubeLive({
      streamType: 'youtube',
      isOnline: true,
      youtubeWatchUrl: 'https://www.youtube.com/live/882LagGGVM4',
      youtubeVideoId: '',
      streamUrl: '',
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
  const counts = { insert: 0, streamInsert: 0, bind: 0, update: 0, streamList: 0 };
  const persisted = [];
  const youtube = {
    liveBroadcasts: {
      insert: async (params) => {
        counts.insert += 1;
        assert.equal(params.requestBody.contentDetails.enableAutoStart, true);
        assert.equal(params.requestBody.contentDetails.enableAutoStop, false);
        return { data: { id: 'bcastLive1' } };
      },
      bind: async (params) => {
        counts.bind += 1;
        assert.equal(params.id, 'bcastLive1');
        assert.equal(params.streamId, 'streamLive1');
        return { data: { id: 'bcastLive1' } };
      },
      update: async (params) => {
        counts.update += 1;
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
      insert: async () => {
        counts.streamInsert += 1;
        return {
          data: {
            id: 'streamLive1',
            cdn: {
              ingestionInfo: {
                ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2',
                streamName: 'aaaa-bbbb-cccc-dddd',
              },
            },
          },
        };
      },
      list: async () => {
        counts.streamList += 1;
        return { data: { items: [] } };
      },
    },
  };

  const live = await insertBindYoutubeLive(youtube, {
    title: 'Ravi Priya Wedding',
    eventId: 'evt1',
    persist: async (partial) => {
      persisted.push({ ...partial, streamKey: partial.streamKey ? true : false });
    },
  });
  assert.equal(live.broadcastId, 'bcastLive1');
  assert.equal(live.streamId, 'streamLive1');
  assert.equal(live.watchUrl, 'https://www.youtube.com/watch?v=bcastLive1');
  assert.equal(live.rtmpUrl, 'rtmp://a.rtmp.youtube.com/live2');
  assert.equal(live.streamKey, 'aaaa-bbbb-cccc-dddd');
  assert.equal(counts.insert, 1);
  assert.equal(counts.streamInsert, 1);
  assert.equal(counts.bind, 1);
  assert.equal(counts.update, 1);
  assert.equal(counts.streamList, 0);
  assert.equal(persisted[0]?.broadcastId, 'bcastLive1');
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

test('applyYoutubeLiveFields does not overwrite a manually supplied youtubeVideoId', () => {
  const payload = {
    youtubeVideoId: '882LagGGVM4',
    youtubeLiveUrl: 'https://www.youtube.com/live/882LagGGVM4',
    streamUrl: 'https://www.youtube.com/live/882LagGGVM4',
  };
  applyYoutubeLiveFields(payload, {
    broadcastId: 'Tya5ZRG6IPg',
    streamId: 'streamLive1',
    watchUrl: 'https://www.youtube.com/watch?v=Tya5ZRG6IPg',
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: 'aaaa-bbbb-cccc-dddd',
  });
  assert.equal(payload.youtubeVideoId, '882LagGGVM4');
  assert.equal(payload.streamUrl, 'https://www.youtube.com/live/882LagGGVM4');
  assert.equal(payload.youtubeStreamKey, 'aaaa-bbbb-cccc-dddd');
});

test('getBroadcastPlaybackInfo returns null without an id', async () => {
  assert.equal(await getBroadcastPlaybackInfo('user1', ''), null);
});

test('eventYoutubeLookupId prefers the manual video ID over a generated broadcast', () => {
  assert.equal(
    eventYoutubeLookupId({
      youtubeBroadcastId: 'Tya5ZRG6IPg',
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=Tya5ZRG6IPg',
      youtubeVideoId: '882LagGGVM4',
      streamUrl: 'https://www.youtube.com/live/882LagGGVM4',
    }),
    '882LagGGVM4'
  );
  assert.equal(
    eventYoutubeLookupId({
      youtubeBroadcastId: '',
      youtubeVideoId: '',
      streamUrl: 'https://youtu.be/dQw4w9WgXcQ',
    }),
    'dQw4w9WgXcQ'
  );
});

test('resolveYoutubeInput extracts a /live/ URL video ID', () => {
  const parsed = resolveYoutubeInput({
    youtubeLiveUrl: 'https://www.youtube.com/live/882LagGGVM4',
    youtubeVideoId: 'Tya5ZRG6IPg',
    youtubeBroadcastId: 'Tya5ZRG6IPg',
  });
  assert.equal(parsed.detectedVideoId, '882LagGGVM4');
  assert.equal(parsed.inputUrl, 'https://www.youtube.com/live/882LagGGVM4');
});

test('resolveYoutubeInput extracts all accepted manual URL formats', () => {
  const id = '882LagGGVM4';
  for (const input of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://youtube.com/live/${id}`,
    id,
  ]) {
    assert.equal(extractYouTubeId(input), id, input);
    assert.equal(resolveYoutubeInput({ youtubeLiveUrl: input }).detectedVideoId, id, input);
  }
});

test('applyManualYoutubeFields preserves the pasted URL and does not keep a generated id', () => {
  const event = {
    youtubeVideoId: 'Tya5ZRG6IPg',
    youtubeBroadcastId: 'Tya5ZRG6IPg',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=Tya5ZRG6IPg',
    streamUrl: 'https://www.youtube.com/watch?v=Tya5ZRG6IPg',
  };
  applyManualYoutubeFields(event, {
    inputUrl: 'https://www.youtube.com/live/882LagGGVM4',
    detectedVideoId: '882LagGGVM4',
  });
  assert.equal(event.youtubeVideoId, '882LagGGVM4');
  assert.equal(event.youtubeBroadcastId, '882LagGGVM4');
  assert.equal(event.streamUrl, 'https://www.youtube.com/live/882LagGGVM4');
  assert.equal(event.youtubeWatchUrl, 'https://www.youtube.com/live/882LagGGVM4');
});

test('youtubeDocFields reads mongoose-like documents that do not spread', () => {
  const event = {};
  Object.defineProperties(event, {
    youtubeVideoId: { value: '882LagGGVM4', enumerable: false },
    streamUrl: { value: 'https://www.youtube.com/live/882LagGGVM4', enumerable: false },
    toObject: {
      enumerable: false,
      value() {
        return {
          youtubeVideoId: '882LagGGVM4',
          streamUrl: 'https://www.youtube.com/live/882LagGGVM4',
          isOnline: true,
        };
      },
    },
  });
  assert.equal({ ...event }.youtubeVideoId, undefined);
  assert.equal(youtubeDocFields(event).youtubeVideoId, '882LagGGVM4');
  assert.equal(resolveYoutubeInput(event).detectedVideoId, '882LagGGVM4');
  assert.equal(
    shouldAutoCreateYoutubeLive({ ...youtubeDocFields(event), streamType: 'youtube' }),
    false
  );
});

test('provisionYoutubeLiveIfNeeded keeps a pasted live URL instead of creating a broadcast', async () => {
  const event = {
    title: 'Srinivas reception',
    youtubeVideoId: '882LagGGVM4',
    streamUrl: 'https://www.youtube.com/live/882LagGGVM4',
    youtubeBroadcastId: 'Tya5ZRG6IPg',
    toObject() {
      return {
        youtubeVideoId: this.youtubeVideoId,
        streamUrl: this.streamUrl,
        youtubeBroadcastId: this.youtubeBroadcastId,
        youtubeWatchUrl: this.youtubeWatchUrl || '',
        isOnline: true,
      };
    },
  };
  const ingest = await provisionYoutubeLiveIfNeeded({ _id: 'user1' }, event, 'youtube');
  assert.equal(ingest, null);
  assert.equal(event.youtubeVideoId, '882LagGGVM4');
  assert.equal(event.youtubeBroadcastId, '882LagGGVM4');
  assert.equal(event.streamUrl, 'https://www.youtube.com/live/882LagGGVM4');
  assert.equal(event.youtubeWatchUrl, 'https://www.youtube.com/live/882LagGGVM4');
});

test('provisionYoutubeLiveIfNeeded does not create when only youtubeLiveUrl is pasted', async () => {
  const event = {
    title: 'Srinivas reception',
    youtubeLiveUrl: 'https://www.youtube.com/live/882LagGGVM4',
    youtubeVideoId: '',
    streamUrl: '',
  };
  const ingest = await provisionYoutubeLiveIfNeeded({ _id: 'user1' }, event, 'youtube');
  assert.equal(ingest, null);
  assert.equal(event.youtubeVideoId, '882LagGGVM4');
  assert.equal(shouldAutoCreateYoutubeLive({
    streamType: 'youtube',
    isOnline: true,
    youtubeLiveUrl: 'https://www.youtube.com/live/882LagGGVM4',
    youtubeVideoId: '',
    streamUrl: '',
  }), false);
});

test('selectLiveYoutubePlayback keeps the event broadcast when it is already live', () => {
  const stored = {
    videoId: 'gusTClw3GbI',
    broadcastId: 'gusTClw3GbI',
    title: 'Mounika weds srinivas',
    isLive: true,
  };
  const picked = selectLiveYoutubePlayback(
    stored,
    [{ videoId: 'otherLive123', broadcastId: 'otherLive123', title: 'Other', isLive: true }],
    { eventBroadcastId: 'gusTClw3GbI', eventTitle: 'Mounika weds srinivas' }
  );
  assert.equal(picked.videoId, 'gusTClw3GbI');
});

test('selectLiveYoutubePlayback uses the account active live when the stored broadcast is waiting', () => {
  const stored = {
    videoId: 'gusTClw3GbI',
    broadcastId: 'gusTClw3GbI',
    title: 'Mounika weds srinivas',
    lifeCycleStatus: 'ready',
    isLive: false,
  };
  const active = {
    videoId: 'nowLiveAbcd1',
    broadcastId: 'nowLiveAbcd1',
    title: 'Mounika weds srinivas',
    lifeCycleStatus: 'live',
    isLive: true,
  };
  const picked = selectLiveYoutubePlayback(stored, [active], {
    eventBroadcastId: 'gusTClw3GbI',
    eventTitle: 'Mounika weds srinivas',
  });
  assert.equal(picked.videoId, 'nowLiveAbcd1');
});

test('selectLiveYoutubePlayback uses the only active live when the stored broadcast is not live', () => {
  const stored = {
    videoId: 'gusTClw3GbI',
    broadcastId: 'gusTClw3GbI',
    isLive: false,
  };
  const picked = selectLiveYoutubePlayback(
    stored,
    [{ videoId: 'studioNow123', broadcastId: 'studioNow123', title: 'Live', isLive: true }],
    { eventBroadcastId: 'gusTClw3GbI', eventTitle: 'Mounika weds srinivas' }
  );
  assert.equal(picked.videoId, 'studioNow123');
});

test('selectLiveYoutubePlayback does not steal another event live when ended', () => {
  const stored = {
    videoId: 'gusTClw3GbI',
    broadcastId: 'gusTClw3GbI',
    isLive: false,
  };
  const picked = selectLiveYoutubePlayback(
    stored,
    [{ videoId: 'otherLive123', broadcastId: 'otherLive123', isLive: true }],
    {
      eventBroadcastId: 'gusTClw3GbI',
      eventTitle: 'Mounika weds srinivas',
      allowActiveFallback: false,
    }
  );
  assert.equal(picked.videoId, 'gusTClw3GbI');
});

test('youtubeOauthUserIds tries createdBy then organizer', () => {
  assert.deepEqual(
    youtubeOauthUserIds({
      createdBy: { _id: 'adminOwner1' },
      organizer: { _id: 'ytChannel2' },
    }),
    ['adminOwner1', 'ytChannel2']
  );
  assert.deepEqual(
    youtubeOauthUserIds({
      createdBy: 'sameUser123',
      organizer: 'sameUser123',
    }),
    ['sameUser123']
  );
});

test('active live list includes persistent Studio Stream now broadcasts', () => {
  const params = activeLiveBroadcastListParams();
  assert.equal(params.mine, true);
  assert.equal(params.broadcastStatus, 'active');
  assert.equal(params.broadcastType, 'all');
});

test('selectLiveYoutubePlayback prefers Studio Stream now over a waiting auto-created broadcast', () => {
  const stored = {
    videoId: 'NPB8S-cxHg0',
    broadcastId: 'NPB8S-cxHg0',
    title: 'Srinivas weds mounika reception',
    lifeCycleStatus: 'ready',
    isLive: false,
  };
  const studioLive = {
    videoId: '882LagGGVM4',
    broadcastId: '882LagGGVM4',
    title: 'Srinivas weds mounika reception',
    lifeCycleStatus: 'live',
    isLive: true,
  };
  const picked = selectLiveYoutubePlayback(stored, [studioLive], {
    eventBroadcastId: 'NPB8S-cxHg0',
    eventTitle: 'Srinivas weds mounika reception',
  });
  assert.equal(picked.videoId, '882LagGGVM4');
});

test('selectLiveYoutubePlayback uses the account live even when the Studio title differs', () => {
  const stored = {
    videoId: 'NPB8S-cxHg0',
    broadcastId: 'NPB8S-cxHg0',
    isLive: false,
  };
  const picked = selectLiveYoutubePlayback(
    stored,
    [
      {
        videoId: '882LagGGVM4',
        broadcastId: '882LagGGVM4',
        title: 'Live stream',
        isLive: true,
      },
    ],
    { eventBroadcastId: 'NPB8S-cxHg0', eventTitle: 'Srinivas weds mounika reception' }
  );
  assert.equal(picked.videoId, '882LagGGVM4');
});

test('describeYoutubeApiError surfaces liveStreamingNotEnabled without tokens', () => {
  const err = {
    code: 403,
    response: {
      status: 403,
      data: {
        error: {
          code: 403,
          message: 'The user is not enabled for live streaming.',
          errors: [
            {
              reason: 'liveStreamingNotEnabled',
              message: 'The user is not enabled for live streaming.',
            },
          ],
        },
      },
    },
  };
  const info = describeYoutubeApiError(err);
  assert.equal(info.status, 403);
  assert.equal(info.reason, 'liveStreamingNotEnabled');
  assert.match(info.message, /not enabled for live streaming/i);
  assert.equal(/ya29|refresh_token|access_token/i.test(JSON.stringify(info)), false);

  const wrapped = wrapYoutubeError(err, 'liveBroadcasts.insert');
  assert.equal(wrapped.code, 'youtube_api_error');
  assert.equal(wrapped.statusCode, 403);
  assert.match(wrapped.message, /liveBroadcasts\.insert/);
  assert.match(wrapped.message, /liveStreamingNotEnabled/);
});

test('describeYoutubeApiError redacts token-like values', () => {
  const info = describeYoutubeApiError({
    message: 'invalid_grant for ya29.secret-token-value',
  });
  assert.equal(info.message.includes('ya29.'), false);
  assert.match(info.message, /\[redacted\]/);
});

test('quotaExceeded does not retry liveBroadcasts.insert', async () => {
  let inserts = 0;
  const youtube = {
    liveBroadcasts: {
      insert: async () => {
        inserts += 1;
        const err = new Error('quota');
        err.response = {
          status: 403,
          data: {
            error: {
              errors: [{ reason: 'quotaExceeded', message: 'The request cannot be completed because you have exceeded your quota.' }],
              message: 'The request cannot be completed because you have exceeded your quota.',
            },
          },
        };
        throw err;
      },
    },
    liveStreams: {
      insert: async () => {
        throw new Error('should not insert stream after quotaExceeded');
      },
    },
  };
  await assert.rejects(
    () => insertBindYoutubeLive(youtube, { title: 'Quota Event', eventId: 'evt-q' }),
    /quotaExceeded/
  );
  assert.equal(inserts, 1);
});

test('quotaExceeded is detected and not treated as a success', () => {
  const err = {
    code: 403,
    response: {
      status: 403,
      data: {
        error: {
          errors: [{ reason: 'quotaExceeded', message: 'The request cannot be completed because you have exceeded your quota.' }],
          message: 'The request cannot be completed because you have exceeded your quota.',
        },
      },
    },
  };
  assert.equal(isYoutubeQuotaExceeded(err), true);
  const wrapped = wrapYoutubeError(err, 'liveBroadcasts.insert');
  assert.match(wrapped.message, /quotaExceeded/);
});

