import { useCallback, useEffect, useRef, useState } from 'react';
import { themeService } from '../../services/theme.service.js';
import { THEME_CATEGORY_LABELS } from '../../utils/eventTheme.js';
import { resolveMediaUrl } from '../../utils/format.js';

/** Draggable admin theme list for reordering via drag and drop. */
export default function AdminThemeDragList({ themes, onReorder, onPreview, onEdit, onDuplicate, onRemove }) {
  const [items, setItems] = useState(themes);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [saving, setSaving] = useState(false);
  const dragNode = useRef(null);

  useEffect(() => {
    if (!dragId && !saving) setItems(themes);
  }, [themes, dragId, saving]);

  const persistOrder = useCallback(
    async (ordered) => {
      setSaving(true);
      try {
        await themeService.reorder(ordered.map((t) => t.id));
        onReorder?.();
      } finally {
        setSaving(false);
      }
    },
    [onReorder]
  );

  const handleDragStart = (e, id) => {
    setDragId(id);
    dragNode.current = e.target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setTimeout(() => e.target.classList.add('theme-drag-ghost'), 0);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('theme-drag-ghost');
    setDragId(null);
    setOverId(null);
    dragNode.current = null;
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (dragId && dragId !== id) setOverId(id);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;

    const from = items.findIndex((t) => t.id === dragId);
    const to = items.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setOverId(null);
    persistOrder(next);
  };

  return (
    <div className="space-y-2">
      {saving && (
        <p className="text-xs text-amber-700">Saving new order…</p>
      )}
      <p className="text-xs text-slate-500">Drag themes to reorder. Order is reflected in the gallery.</p>
      {items.map((t, idx) => (
        <div
          key={t.id}
          draggable
          onDragStart={(e) => handleDragStart(e, t.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, t.id)}
          onDrop={(e) => handleDrop(e, t.id)}
          className={`theme-drag-row ${overId === t.id ? 'theme-drag-row-over' : ''}`}
        >
          <span className="theme-drag-handle" title="Drag to reorder" aria-hidden>
            ⠿
          </span>
          <span className="w-6 text-center text-xs font-bold text-slate-400">{idx + 1}</span>
          <div
            className="h-10 w-14 shrink-0 rounded-md bg-cover bg-center"
            style={{
              backgroundImage: t.backgroundImage ? `url(${resolveMediaUrl(t.backgroundImage)})` : undefined,
              backgroundColor: t.colors?.primary,
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
            <p className="truncate text-xs text-slate-500">{THEME_CATEGORY_LABELS[t.category]}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onPreview(t)}>
              Preview
            </button>
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onEdit(t)}>
              Edit
            </button>
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onDuplicate(t.id)}>
              Duplicate
            </button>
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs text-red-600" onClick={() => onRemove(t.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
