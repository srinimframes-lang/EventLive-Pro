import { useEffect, useState } from 'react';

/**
 * Small non-blocking toast for automatic failover.
 */
export default function FailoverToast({ message, visible, onDismiss }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible || !message) {
      setShow(false);
      return undefined;
    }
    setShow(true);
    const t = setTimeout(() => {
      setShow(false);
      onDismiss?.();
    }, 8000);
    return () => clearTimeout(t);
  }, [visible, message, onDismiss]);

  if (!show || !message) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[80] w-[min(92vw,28rem)] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 shadow-lg">
        {message}
      </div>
    </div>
  );
}
