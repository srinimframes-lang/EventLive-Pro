/**
 * Failover helpers for the watch player.
 * All paths are no-ops unless config.failoverFeatureEnabled === true
 * (server only sets that when FAILOVER_ENABLED=true).
 */

export function isFailoverFeatureOn(config) {
  return Boolean(config?.failoverFeatureEnabled);
}

/**
 * When failover is active, play YouTube backup instead of HLS.
 */
export function shouldPlayYoutubeBackup(config) {
  if (!isFailoverFeatureOn(config)) return false;
  if (config.activeSource !== 'youtube') return false;
  const provider = config.provider;
  const isServer =
    provider === 'rtmp' || provider === 'hls' || provider === 'webrtc';
  // Only override server-primary events; pure YouTube events already use YouTube.
  return isServer;
}

export function failoverBackupVideoId(config, extractYouTubeId) {
  return (
    extractYouTubeId(config?.backupYoutubeVideoId || '') ||
    extractYouTubeId(config?.youtubeVideoId || '') ||
    ''
  );
}
