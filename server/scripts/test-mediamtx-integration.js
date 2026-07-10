/**
 * Unit tests for MediaMTX URL/key helpers.
 * Run: node scripts/test-mediamtx-integration.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.RTMP_INGEST_URL = 'rtmp://200.97.166.42:1935/live';
process.env.HLS_PLAYBACK_BASE = 'http://200.97.166.42:8888';
process.env.WEBRTC_PLAYBACK_BASE = 'http://200.97.166.42:8889';

const {
  streamKeyFromEventId,
  parseMediaMtxPath,
  deriveHlsPlaybackUrl,
  deriveWebRtcPlaybackUrl,
  buildRtmpCredentials,
  mediamtxPathName,
} = await import('../src/utils/mediaStream.js');

const eventId = '507f1f77bcf86cd799439011';

if (streamKeyFromEventId(eventId) !== eventId) {
  throw new Error('streamKeyFromEventId should return the event id');
}

if (parseMediaMtxPath('live/507f1f77bcf86cd799439011') !== eventId) {
  throw new Error('parseMediaMtxPath should extract key from live/<id>');
}

const hls = deriveHlsPlaybackUrl({ _id: eventId, streamProvider: 'rtmp', rtmpStreamKey: eventId });
if (hls !== `http://200.97.166.42:8888/live/${eventId}/index.m3u8`) {
  throw new Error(`Unexpected HLS URL: ${hls}`);
}

const whep = deriveWebRtcPlaybackUrl({ _id: eventId, rtmpStreamKey: eventId });
if (whep !== `http://200.97.166.42:8889/live/${eventId}/whep`) {
  throw new Error(`Unexpected WebRTC URL: ${whep}`);
}

const creds = buildRtmpCredentials({ _id: eventId, id: eventId, streamProvider: 'rtmp', rtmpStreamKey: eventId });
if (creds.fullUrl !== `rtmp://200.97.166.42:1935/live/${eventId}`) {
  throw new Error(`Unexpected RTMP URL: ${creds.fullUrl}`);
}
if (creds.mediamtxPath !== mediamtxPathName(eventId)) {
  throw new Error('Unexpected MediaMTX path');
}

console.log('OK MediaMTX URL/key helpers');
console.log('  RTMP', creds.fullUrl);
console.log('  HLS ', creds.playbackUrl);
console.log('  WHEP', creds.webrtcUrl);

console.log('All MediaMTX integration tests passed.');
