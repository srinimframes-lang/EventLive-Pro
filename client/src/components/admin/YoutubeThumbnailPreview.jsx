import { resolveMediaUrl } from '../../utils/format.js';

/**
 * Admin 16:9 YouTube thumbnail preview + regenerate/save/download actions.
 */
export default function YoutubeThumbnailPreview({
  coverSrc = '',
  previewSrc = '',
  generating = false,
  saving = false,
  dirty = false,
  hasCover = false,
  stored = false,
  error = '',
  onRegenerate,
  onSave,
  onDownload,
}) {
  const displaySrc = previewSrc || coverSrc;
  const busy = generating || saving;

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">YouTube thumbnail</p>
          <p className="mt-0.5 text-xs text-slate-500">
            1280×720 (16:9) share preview — generated from the couple photo. Used for WhatsApp / Facebook / OG.
          </p>
        </div>
        {stored && !dirty && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            Saved
          </span>
        )}
        {dirty && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
            Unsaved preview
          </span>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm">
        {displaySrc ? (
          <img
            src={resolveMediaUrl(displaySrc)}
            alt="YouTube thumbnail preview"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center bg-slate-900 text-center text-sm text-slate-400">
            Upload a couple photo to generate a thumbnail
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={onRegenerate}
          disabled={!hasCover || busy}
        >
          {generating ? 'Generating…' : 'Regenerate'}
        </button>
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={onSave}
          disabled={!hasCover || !previewSrc || busy || (!dirty && stored)}
        >
          {saving ? 'Saving…' : 'Save thumbnail'}
        </button>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={onDownload}
          disabled={!displaySrc || busy}
        >
          Download preview
        </button>
      </div>
    </div>
  );
}
