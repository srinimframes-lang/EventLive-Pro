/**
 * Super Admin only — shown when server recovers after failover.
 * Does NOT auto-switch viewers back.
 */
export default function FailoverRecoveryBanner({
  visible,
  busy = false,
  onContinueYoutube,
  onSwitchServer,
}) {
  if (!visible) return null;

  return (
    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
      <p className="font-medium">Server recovered</p>
      <p className="mt-1 text-emerald-900/80">
        Viewers are still on the YouTube backup. Choose how to proceed:
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={onContinueYoutube}
        >
          Continue on YouTube
        </button>
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={onSwitchServer}
        >
          Switch back to Server
        </button>
      </div>
    </div>
  );
}
