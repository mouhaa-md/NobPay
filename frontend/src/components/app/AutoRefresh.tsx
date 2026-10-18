'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-renders the server components every few seconds while something is still in flight (a payout, an invoice),
 * and straight away when the user comes back to the tab or the connection returns.
 */
export function AutoRefresh({ active, everyMs = 3000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = setInterval(refresh, everyMs);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [active, everyMs, router]);
  return null;
}
