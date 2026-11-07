import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error';

const HOUR = 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // retry only server hiccups, never 4xx (they will not fix themselves)
      retry: (count, error) =>
        error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

/**
 * Options for data that rarely changes (countries, ports, lines, yards…): fresh for
 * an hour, kept for a day, and saved to localStorage so a reload needs no request.
 */
export const STATIC_DATA = {
  staleTime: HOUR,
  gcTime: 24 * HOUR,
  meta: { persist: true },
} as const;

export const persister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: 'hammerline-cache',
});

export const persistOptions = {
  persister,
  maxAge: 24 * HOUR,
  // a new build drops the old cache, in case the shape of the data changed
  buster: import.meta.env.VITE_APP_VERSION ?? 'dev',
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { meta?: Record<string, unknown>; state: { status: string } }) =>
      query.meta?.persist === true && query.state.status === 'success',
  },
};
