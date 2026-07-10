import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lightweight toast helper for save/error feedback.
 */
export function useToast(durationMs = 6000) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const clearToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message, type = 'error') => {
      if (!message) return;
      clearToast();
      setToast({ message, type });
      timerRef.current = setTimeout(clearToast, durationMs);
    },
    [clearToast, durationMs]
  );

  useEffect(() => () => clearToast(), [clearToast]);

  return { toast, showToast, clearToast };
}
