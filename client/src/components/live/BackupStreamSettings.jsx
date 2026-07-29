import { useMemo, useState } from 'react';
import { streamService } from '../../services/stream.service.js';
import { extractYouTubeId } from '../../utils/format.js';

/**
 * Backup Stream (YouTube) settings for Premium Server events.
 * Hidden unless `enabled` (FAILOVER_ENABLED → settings.failoverFeatureEnabled).
 *
 * Controlled mode (Event Create/Edit): pass value + onChange; no internal save.
 * Studio mode: pass eventId + showSaveButton to PATCH /stream.
 */
export default function BackupStreamSettings({
  enabled,
  value = {},
  onChange,
  eventId,
  showSaveButton = false,
  onSaved,
  statusLabel = '',
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const backupEnabled = Boolean(value.backupStreamEnabled);
  const youtubeInput = value.backupYoutubeVideoId || '';
  const videoId = useMemo(() => extractYouTubeId(youtubeInput), [youtubeInput]);
  const hasInput = Boolean(String(youtubeInput).trim());
  const invalidId = hasInput && !videoId;

  if (!enabled) return null;

  const setField = (patch) => {
    onChange?.({
      backupStreamEnabled: backupEnabled,
      backupYoutubeVideoId: youtubeInput,
      ...patch,
    });
    setError('');
    setMsg('');
  };

  const save = async () => {
    if (!eventId) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      if (backupEnabled && !videoId) {
        throw new Error('Backup YouTube Video ID is required when Backup Stream is enabled');
      }
      if (hasInput && !videoId) {
        throw new Error('Enter a valid YouTube Video ID or Live URL');
      }
      const data = await streamService.updateConfig(eventId, {
        backupStreamEnabled: backupEnabled,
        backupYoutubeVideoId: videoId,
      });
      setMsg('Backup stream settings saved');
      onChange?.({
        backupStreamEnabled: Boolean(data.backupStreamEnabled),
        backupYoutubeVideoId: data.backupYoutubeVideoId || videoId,
      });
      onSaved?.(data);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Backup Stream</h3>
      <p className="mt-1 text-xs text-slate-500">
        If the MediaMTX server goes down, viewers automatically switch to this YouTube Live without
        refreshing. OBS must also publish to YouTube.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={backupEnabled}
          onChange={(e) => setField({ backupStreamEnabled: e.target.checked })}
        />
        Enable Backup Stream
      </label>

      <label
        className="mt-3 block text-sm font-medium text-slate-700"
        htmlFor="backupYoutubeVideoId"
      >
        Backup YouTube Video ID
      </label>
      <input
        id="backupYoutubeVideoId"
        className={`input mt-1 font-mono text-xs ${invalidId ? 'border-red-400 focus:border-red-500' : ''}`}
        placeholder="https://youtu.be/… or 11-character video id"
        value={youtubeInput}
        onChange={(e) => setField({ backupYoutubeVideoId: e.target.value })}
        aria-invalid={invalidId}
      />

      {invalidId ? (
        <p className="mt-1 text-xs text-red-600">Enter a valid YouTube Video ID or Live URL.</p>
      ) : null}
      {videoId ? (
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
          <p className="px-3 pt-2 text-xs text-slate-500">
            Detected ID: <span className="font-mono font-medium text-slate-700">{videoId}</span>
          </p>
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt="YouTube backup preview"
            className="mt-2 aspect-video w-full max-w-sm object-cover"
            loading="lazy"
          />
        </div>
      ) : null}

      {showSaveButton ? (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className="btn-primary text-sm" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save backup settings'}
          </button>
          {statusLabel ? <span className="text-xs text-slate-500">Status: {statusLabel}</span> : null}
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

/** Client-side gate used by EventForm before create/update. */
export function validateBackupStreamFields({ backupStreamEnabled, backupYoutubeVideoId }) {
  if (!backupStreamEnabled) return '';
  const id = extractYouTubeId(backupYoutubeVideoId || '');
  if (!id) {
    return 'Backup YouTube Video ID is required when Backup Stream is enabled';
  }
  return '';
}
