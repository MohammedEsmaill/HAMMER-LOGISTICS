import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export type InboxKind = 'SHIPMENT_NEW' | 'SHIPMENT_ETA' | 'SHIPMENT_STUCK' | 'SHIPMENT_ETA_PASSED' | 'DOCUMENT_EXPIRY' | 'CUSTODY_OPEN';

export interface Inbox {
  unread: number;
  items: { id: number; kind: InboxKind; title: string; body: string; link: string; readAt: string | null; createdAt: string }[];
  waiting: { type: string; label: string; status: string; count: number }[];
}

export const INBOX_KEY = ['inbox'] as const;

/** The user's alerts and what waits for their approval step, checked every 30 seconds. */
export const useInbox = () =>
  useQuery({ queryKey: INBOX_KEY, queryFn: () => api.get<Inbox>('/inbox'), refetchInterval: 30_000 });

/** How many documents wait for this user's approval step (the bell and the sidebar share it). */
export function useWaitingCount() {
  const { data } = useInbox();
  return data?.waiting.reduce((n, w) => n + w.count, 0) ?? 0;
}
