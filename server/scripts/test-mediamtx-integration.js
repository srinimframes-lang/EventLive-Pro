/**
 * Unit tests for HTTPS playback URL normalization.
 * Run: node scripts/test-mediamtx-integration.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.REQUIRE_SECURE_PLAYBACK = 'true';
process.env.RTMP_INGEST_URL = 'rtmp://stream.eventlivepro.com:1935/live';
process.env.HLS_PLAYBACK_BASE = 'https://stream.eventlivepro.com';
process.env.WEBRTC_PLAYBACK_BASE = 'https://stream.eventlivepro.com';

const {
  streamKeyFromEventId,
  parseMediaMtxPath,
  deriveHlsPlaybackUrl,
  deriveWebRtcPlaybackUrl,
  buildRtmpCredentials,
  mediamtxPathName,
  normalizePlaybackUrl,
  buildHlsPlaybackUrl,
} = await import('../src/utils/mediaStream.js');

const eventId = '507f1f77bcf86cd799439011';

if (streamKeyFromEventId(eventId) !== eventId) {
  throw new Error('streamKeyFromEventId should return the event id');
}

if (parseMediaMtxPath('live/507f1f77bcf86cd799439011') !== eventId) {
  throw new Error('parseMediaMtxPath should extract key from live/<id>');
}

const hls = buildHlsPlaybackUrl(eventId);
if (hls !== `https://stream.eventlivepro.com/live/${eventId}/index.m3u8`) {
  throw new Error(`Unexpected HTTPS HLS URL: ${hls}`);
}

const legacy = normalizePlaybackUrl(
  `http://200.97.166.42:8888/live/${eventId}/index.m3u8`
);
if (legacy !== `https://stream.eventlivepro.com/live/${eventId}/index.m3u8`) {
  throw new Error(`Legacy HTTP URL not upgraded: ${legacy}`);
}

const derived = deriveHlsPlaybackUrl({
  _id: eventId,
  streamProvider: 'rtmp',
  rtmpStreamKey: eventId,
  hlsUrl: `http://200.97.166.42:8888/live/${eventId}/index.m3u8`,
});
if (!derived.startsWith('https://')) {
  throw new Error(`deriveHlsPlaybackUrl must return HTTPS: ${derived}`);
}

const whep = deriveWebRtcPlaybackUrl({ _id: eventId, rtmpStreamKey: eventId });
if (whep !== `https://stream.eventlivepro.com/live/${eventId}/whep`) {
  throw new Error(`Unexpected WebRTC URL: ${whep}`);
}

const creds = buildRtmpCredentials({ _id: eventId, id: eventId, streamProvider: 'rtmp', rtmpStreamKey: eventId });
if (creds.fullUrl !== `rtmp://stream.eventlivepro.com:1935/live/${eventId}`) {
  throw new Error(`RTMP ingest should use stream domain: ${creds.fullUrl}`);
}
if (!creds.playbackUrl.startsWith('https://stream.eventlivepro.com')) {
  throw new Error(`Playback must be HTTPS: ${creds.playbackUrl}`);
}
if (creds.mediamtxPath !== mediamtxPathName(eventId)) {
  throw new Error('Unexpected MediaMTX path');
}

console.log('OK HTTPS playback normalization');
console.log('  RTMP (OBS) ', creds.fullUrl);
console.log('  HLS (watch)', creds.playbackUrl);
console.log('All MediaMTX integration tests passed.');
