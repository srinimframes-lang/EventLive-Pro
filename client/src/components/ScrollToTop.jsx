import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Ensures each new navigation opens at the top of the page.
 * - PUSH / REPLACE / hard load → scroll to (0, 0)
 * - POP (back/forward) → restore the previous scroll position for that history entry
 * - Hash links (#section) → scroll only to that element (user-intent)
 */
export default function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  const positions = useRef(new Map());
  const ready = useRef(false);

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    // Hard refresh / first paint: always start at top (never restore mid/bottom).
    window.scrollTo(0, 0);
    ready.current = true;
  }, []);

  useLayoutEffect(() => {
    if (!ready.current) return undefined;

    // Save outgoing position for back/forward restore.
    const prevKey = positions.current.get('__current_key__');
    if (prevKey) {
      positions.current.set(prevKey, window.scrollY || window.pageYOffset || 0);
    }
    positions.current.set('__current_key__', key);

    if (hash) {
      const id = decodeURIComponent(hash.replace(/^#/, ''));
      if (id) {
        // Defer one frame so the target exists after route render.
        const t = window.setTimeout(() => {
          const el = document.getElementById(id);
          if (el) el.scrollIntoView({ block: 'start' });
          else window.scrollTo(0, 0);
        }, 0);
        return () => window.clearTimeout(t);
      }
    }

    if (navType === 'POP') {
      const y = positions.current.get(key);
      window.scrollTo(0, typeof y === 'number' ? y : 0);
      return undefined;
    }

    window.scrollTo(0, 0);
    return undefined;
  }, [pathname, hash, key, navType]);

  return null;
}
