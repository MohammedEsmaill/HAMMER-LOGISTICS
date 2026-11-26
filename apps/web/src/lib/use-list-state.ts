import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';

/** The rows-per-page choices every list offers. */
export const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_SIZE = 25;

/**
 * How many rows a page shows, the user's own choice for every list, remembered in this
 * browser per user (a private window starts from 25 again).
 */
export function usePageSize(): [number, (size: number) => void] {
  const { user } = useAuth();
  const key = `hl.pageSize.${user?.id ?? 'guest'}`;
  const read = () => {
    try {
      const n = Number(localStorage.getItem(key));
      return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_SIZE;
    } catch {
      return DEFAULT_SIZE;
    }
  };
  const [size, setSize] = useState(read);
  const change = useCallback(
    (n: number) => {
      setSize(n);
      try {
        localStorage.setItem(key, String(n));
      } catch {
        // a private window keeps it for this visit only
      }
    },
    [key],
  );
  return [size, change];
}

type Value = string | number | boolean | undefined;

/**
 * A list's page and filters, kept in the page address: back from a shipment, a reload or
 * a shared link opens the same page with the same filters. Values equal to their default
 * stay out of the address. `prefix` keeps two lists on one page apart.
 *
 * Each value is read back with the type of its default; `numbers` names the keys whose
 * default is empty but whose value is a number (an id picked from a list).
 */
export function useListState<T extends { page: number } & Record<string, Value>>(
  defaults: T,
  { prefix = '', numbers = [] }: { prefix?: string; numbers?: (keyof T)[] } = {},
): [T, (patch: Partial<T>) => void] {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const out = { ...defaults } as Record<string, Value>;
    for (const key of Object.keys(defaults)) {
      const raw = params.get(prefix + key);
      if (raw === null) continue;
      const d = defaults[key];
      if (typeof d === 'number' || numbers.includes(key as keyof T)) {
        const n = Number(raw);
        if (Number.isFinite(n)) out[key] = n;
      } else if (typeof d === 'boolean') out[key] = raw === '1';
      else out[key] = raw;
    }
    if (!(Number(out.page) >= 1)) out.page = 1;
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the defaults are fixed per list
  }, [params, prefix]);

  /** Changes some values; any change but the page itself goes back to page 1. */
  const set = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const merged = { ...state, ...(('page' in patch) ? {} : { page: 1 }), ...patch } as Record<string, Value>;
          for (const key of Object.keys(defaults)) {
            const v = merged[key];
            const d = defaults[key];
            const blank = (x: Value) => x === undefined || x === '';
            if (v === d || (blank(v) && blank(d))) next.delete(prefix + key);
            else next.set(prefix + key, typeof v === 'boolean' ? (v ? '1' : '0') : blank(v) ? '' : String(v));
          }
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the defaults are fixed per list
    [state, setParams, prefix],
  );

  return [state, set];
}
