import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now, following changes (window resize, rotation). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** A phone-width screen (below Tailwind's sm). */
export const useIsPhone = () => useMedia('(max-width: 639px)');
