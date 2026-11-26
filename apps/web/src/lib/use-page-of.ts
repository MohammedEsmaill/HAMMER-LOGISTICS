import { useEffect, useRef } from 'react';
import { useListState, usePageSize } from './use-list-state';

/**
 * Pages a list that comes whole from the server (short lists: users, lookups), so it
 * shows like the paged ones: the user's rows per page, and the page kept in the address.
 * Back to page 1 whenever `resetKey` changes (a new filter).
 */
export function usePageOf<T>(rows: T[] | undefined, resetKey: unknown = null) {
  const [pageSize, setPageSize] = usePageSize();
  const [{ page }, setList] = useListState({ page: 1 });
  const key = useRef(resetKey);
  useEffect(() => {
    if (key.current === resetKey) return;
    key.current = resetKey;
    setList({ page: 1 });
  }, [resetKey, setList]);
  const total = rows?.length ?? 0;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, last);
  return {
    page: current,
    pageSize,
    total,
    items: rows?.slice((current - 1) * pageSize, current * pageSize),
    setPage: (p: number) => setList({ page: p }),
    setPageSize: (n: number) => {
      setPageSize(n);
      setList({ page: 1 });
    },
  };
}
