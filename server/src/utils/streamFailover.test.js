import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyEmergencyAction,
  applyHealthSample,
  evaluateStreamHealth,
  FAILOVER_FAIL_THRESHOLD,
  isFailoverCandidate,
  publicFailoverSlice,
  resolveActiveSource,
  resolveBackupYoutubeId,
} from './streamFailover.js';

describe('resolveActiveSource', () => {
  it('always returns server when feature disabled', () => {
    assert.equal(
      resolveActiveSource({ backupStatus: 'active', backupStreamEnabled: true }, { failoverEnabled: false }),
      'server'
    );
  });

  it('honors emergency force_youtube', () => {
    assert.equal(
      resolveActiveSource(
        {
          emergencyOverride: { enabled: true, mode: 'force_youtube' },
          playbackMode: 'auto',
        },
        { failoverEnabled: true }
      ),
      'youtube'
    );
  });

  it('stays on youtube after failover until admin switches', () => {
    assert.equal(
      resolveActiveSource(
        {
          backupStreamEnabled: true,
          backupStatus: 'active',
          playbackMode: 'auto',
        },
        { failoverEnabled: true }
      ),
      'youtube'
    );
    assert.equal(
      resolveActiveSource(
        {
          backupStreamEnabled: true,
          backupStatus: 'server_recovered',
          playbackMode: 'auto',
        },
        { failoverEnabled: true }
      ),
      'youtube'
    );
  });
});

describe('evaluateStreamHealth / applyHealthSample', () => {
  it('fails when playlist missing', () => {
    assert.equal(evaluateStreamHealth({ playlistOk: false, publishing: true }).healthy, false);
  });

  it('fails when MediaMTX path not ready', () => {
    assert.equal(evaluateStreamHealth({ playlistOk: true, publishing: false }).healthy, false);
  });

  it('passes when playlist ok and publishing unknown', () => {
    assert.equal(evaluateStreamHealth({ playlistOk: true, publishing: null }).healthy, true);
  });

  it('triggers failover after threshold failures', () => {
    let state = {
      backupStreamEnabled: true,
      backupStatus: 'monitoring',
      playbackMode: 'auto',
      streamHealth: { consecutiveFailures: FAILOVER_FAIL_THRESHOLD - 1, consecutiveSuccesses: 0 },
    };
    const patch = applyHealthSample(state, { healthy: false, reason: 'hls_playlist_unavailable' });
    assert.equal(patch.backupStatus, 'active');
    assert.equal(patch.transition, 'failover');
    assert.equal(patch.streamHealth.consecutiveFailures, FAILOVER_FAIL_THRESHOLD);
  });

  it('does not auto switch back on recovery', () => {
    const patch = applyHealthSample(
      {
        backupStatus: 'active',
        playbackMode: 'auto',
        streamHealth: { consecutiveFailures: 0, consecutiveSuccesses: 2 },
      },
      { healthy: true }
    );
    assert.equal(patch.backupStatus, 'server_recovered');
    assert.equal(patch.transition, 'recovered');
    assert.equal(resolveActiveSource({ ...patch, backupStreamEnabled: true }, { failoverEnabled: true }), 'youtube');
  });
});

describe('isFailoverCandidate / backup id', () => {
  it('requires feature flag, live rtmp, backup id', () => {
    const base = {
      backupStreamEnabled: true,
      streamProvider: 'rtmp',
      isLive: true,
      backupYoutubeVideoId: 'dQw4w9WgXcQ',
    };
    assert.equal(isFailoverCandidate(base, { failoverEnabled: false }), false);
    assert.equal(isFailoverCandidate(base, { failoverEnabled: true }), true);
    assert.equal(
      isFailoverCandidate({ ...base, isLive: false }, { failoverEnabled: true }),
      false
    );
  });

  it('resolves backup youtube id', () => {
    assert.equal(resolveBackupYoutubeId({ backupYoutubeVideoId: 'https://youtu.be/dQw4w9WgXcQ' }), 'dQw4w9WgXcQ');
  });
});

describe('publicFailoverSlice / emergency', () => {
  it('returns null when feature off', () => {
    assert.equal(publicFailoverSlice({ backupStatus: 'active' }, { failoverEnabled: false }), null);
  });

  it('force_youtube emergency action', () => {
    const patch = applyEmergencyAction({ playbackMode: 'auto', backupStatus: 'idle' }, 'force_youtube', {
      userId: 'u1',
    });
    assert.equal(patch.playbackMode, 'force_youtube');
    assert.equal(patch.backupStatus, 'active');
    assert.equal(patch.emergencyOverride.mode, 'force_youtube');
  });

  it('switch_server clears failover stay', () => {
    const patch = applyEmergencyAction(
      { playbackMode: 'auto', backupStatus: 'server_recovered' },
      'switch_server'
    );
    assert.equal(patch.playbackMode, 'force_server');
    assert.equal(patch.backupStatus, 'monitoring');
  });
});
