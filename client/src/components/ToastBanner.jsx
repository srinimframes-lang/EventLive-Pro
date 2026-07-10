/**
 * Fixed toast banner for errors and success messages.
 */
export default function ToastBanner({ toast, onClose }) {
  if (!toast) return null;

  const isError = toast.type !== 'success';

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
          isError ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}
      >
        <p className="flex-1">{toast.message}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-1 text-white/90 hover:bg-white/10"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
