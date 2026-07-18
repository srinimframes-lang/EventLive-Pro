import { useEffect, useRef, useState } from 'react';
import { eventService } from '../../services/event.service.js';
import { resolveMediaUrl } from '../../utils/format.js';

const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

/**
 * Admin/Studio gallery manager: upload with progress, multi-select delete,
 * reorder, cover photo, and preview.
 */
export default function EventGalleryManager({ eventId, photos = [], onChange, onError }) {
  const inputRef = useRef(null);
  const [gallery, setGallery] = useState(photos);
  const [selected, setSelected] = useState(() => new Set());
  const [uploadPct, setUploadPct] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setGallery(photos);
    setSelected(new Set());
  }, [photos]);

  const apply = (next) => {
    setGallery(next);
    onChange?.(next);
  };

  const fail = (err) => {
    onError?.(err?.message || String(err));
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setBusy(true);
    setUploadPct(0);
    try {
      const next = await eventService.uploadGallery(eventId, files, [], (ev) => {
        if (!ev.total) return;
        setUploadPct(Math.round((ev.loaded / ev.total) * 100));
      });
      apply(next);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      setUploadPct(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === gallery.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(gallery.map((p) => String(p.id || p._id))));
  };

  const deleteOne = async (photoId) => {
    if (!window.confirm('Delete this photo from the gallery?')) return;
    setBusy(true);
    try {
      const next = await eventService.deleteGalleryPhoto(eventId, photoId);
      apply(next);
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(String(photoId));
        return n;
      });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected photo(s)?`)) return;
    setBusy(true);
    try {
      const next = await eventService.deleteGalleryPhotos(eventId, ids);
      apply(next);
      setSelected(new Set());
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const move = async (index, dir) => {
    const next = [...gallery];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    const photoIds = next.map((p) => String(p.id || p._id));
    setBusy(true);
    try {
      const updated = await eventService.reorderGallery(eventId, photoIds);
      apply(updated);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const setCover = async (photoId) => {
    setBusy(true);
    try {
      const res = await eventService.setGalleryCover(eventId, photoId);
      apply(res.gallery || res);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          Gallery · {gallery.length} photo{gallery.length === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap gap-2">
          {gallery.length > 0 && (
            <button type="button" className="btn-outline text-xs" disabled={busy} onClick={selectAll}>
              {selected.size === gallery.length ? 'Clear selection' : 'Select all'}
            </button>
          )}
          {selected.size > 0 && (
            <button
              type="button"
              className="btn-outline text-xs text-red-600"
              disabled={busy}
              onClick={deleteSelected}
            >
              Delete selected ({selected.size})
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        JPG, JPEG, PNG, or WebP. Stored in Cloudflare R2 (not on the VPS disk).
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        disabled={busy}
        onChange={handleUpload}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
      />

      {uploadPct != null && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>Uploading…</span>
            <span>{uploadPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        </div>
      )}

      {gallery.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No gallery photos yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {gallery.map((photo, index) => {
            const id = String(photo.id || photo._id);
            const isSelected = selected.has(id);
            return (
              <li
                key={id}
                className={`group relative overflow-hidden rounded-lg border bg-slate-50 ${
                  isSelected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  className="block aspect-square w-full"
                  onClick={() => setPreview(photo)}
                  title="Preview"
                >
                  <img
                    src={resolveMediaUrl(photo.url)}
                    alt={photo.filename || photo.caption || 'Gallery photo'}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
                {photo.isCover && (
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    Cover
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <label className="flex cursor-pointer items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(id)}
                      className="h-3 w-3"
                    />
                    Select
                  </label>
                  <button
                    type="button"
                    className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    title="Move earlier"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800"
                    disabled={busy || index === gallery.length - 1}
                    onClick={() => move(index, 1)}
                    title="Move later"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="rounded bg-amber-400/95 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900"
                    disabled={busy || photo.isCover}
                    onClick={() => setCover(id)}
                  >
                    Cover
                  </button>
                  <button
                    type="button"
                    className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    disabled={busy}
                    onClick={() => deleteOne(id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            aria-label="Close preview"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-2xl text-white"
            onClick={() => setPreview(null)}
          >
            ×
          </button>
          <img
            src={resolveMediaUrl(preview.url)}
            alt={preview.filename || 'Preview'}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
