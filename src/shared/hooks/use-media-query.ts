import { useSyncExternalStore } from 'react';

const getServerSnapshot = (fallback: boolean) => () => fallback;

export function useMediaQuery(query: string, fallback = false): boolean {
  const getSnapshot = () => {
    if (typeof window === 'undefined') return fallback;
    return window.matchMedia(query).matches;
  };

  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') return () => {};
    const mediaQuery = window.matchMedia(query);
    const handler = () => onStoreChange();
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot(fallback));
}
