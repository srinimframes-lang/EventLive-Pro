import { getEventTypeSelectGroups } from '../config/eventTypes.js';

/**
 * Mobile-friendly Event Type <select>.
 * Flat list of current form types; legacy values appear only when already selected.
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

  const useOptGroups = groups.length > 1 || includeEmpty;

  return (
    <select
      id={id}
      name={name}
      required={required}
      value={value}
      onChange={onChange}
      className={[
        'input w-full min-h-[2.75rem] text-base',
        'sm:text-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {includeEmpty && <option value="">{emptyLabel}</option>}
      {useOptGroups
        ? groups.map((g) => (
            <optgroup key={g.id} label={g.optionLabel}>
              {g.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))
        : groups[0]?.types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
    </select>
  );
}
