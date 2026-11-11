import { useState } from 'react';

/**
 * Pages a list that comes whole from the server (short lists: users, lookups), so it
 * shows like the paged ones. Back to page 1 whenever `resetKey` changes (a new filter).
 */
export function usePageOf<T>(rows: T[] | undefined, pageSize = 50, resetKey: unknown = null) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  const page = state.key === resetKey ? state.page : 1;
  const total = rows?.length ?? 0;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, last);
  return {
    page: current,
    pageSize,
    total,
    items: rows?.slice((current - 1) * pageSize, current * pageSize),
    setPage: (p: number) => setState({ page: p, key: resetKey }),
  };
}
