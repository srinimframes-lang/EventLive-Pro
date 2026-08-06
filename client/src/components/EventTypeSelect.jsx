import { getEventTypeSelectGroups } from '../config/eventTypes.js';

/**
 * Mobile-friendly grouped Event Type <select>.
 * Uses native <optgroup> so iOS/Android pickers stay reliable.
 */
export default function EventTypeSelect({
  id = 'category',
  name = 'category',
  value = '',
  onChange,
  className = '',
  includeEmpty = false,
  emptyLabel = 'All event types',
  includeLegacy = false,
  required = false,
}) {
  const groups = getEventTypeSelectGroups(value, {
    includeLegacy: includeLegacy || includeEmpty,
  });

  return (
    <select
      id={id}
      name={name}
      required={required}
      value={value}
      onChange={onChange}
      className={[
        'input w-full min-h-[2.75rem] text-base',
        // Avoid iOS auto-zoom on focus (needs ≥16px on small screens).
        'sm:text-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {includeEmpty && <option value="">{emptyLabel}</option>}
      {groups.map((g) => (
        <optgroup key={g.id} label={g.optionLabel}>
          {g.types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
