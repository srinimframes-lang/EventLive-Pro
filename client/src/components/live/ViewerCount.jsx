export default function ViewerCount({ count, isLive }) {
  return (
    <div className="inline-flex items-center gap-3">
      {isLive ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          Offline
        </span>
      )}
      <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {count.toLocaleString()} watching
      </span>
    </div>
  );
}
