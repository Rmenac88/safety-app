import { useEffect, useState } from 'react';

/**
 * Current timestamp (ms) that re-renders the component every `intervalMs`.
 * Reading Date.now() directly during render is impure: the value only changed when
 * something else re-rendered (countdowns froze, expired items stayed visible).
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    // Refresh right away when (re)enabled: the stored value may be hours old
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs, enabled]);

  return now;
}
