const STYLES = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-emerald-100 text-emerald-700',
  live: 'bg-red-100 text-red-700',
  ended: 'bg-slate-200 text-slate-500',
  cancelled: 'bg-amber-100 text-amber-700',
};

export default function StatusBadge({ status }) {
  const className = STYLES[status] || STYLES.draft;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${className}`}
    >
      {status === 'live' && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
      )}
      {status}
    </span>
  );
}
