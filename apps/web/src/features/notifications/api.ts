import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';

export type WhatsappState = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED';

export interface WhatsappStatus {
  state: WhatsappState;
  qr: string | null;
  account: { id: string; name?: string } | null;
  group: { jid: string; name: string } | null;
}

export interface WhatsappGroup {
  id: string;
  name: string;
  members: number;
}

export interface NotificationRow {
  id: number;
  kind: 'NEW_SHIPMENT' | 'ETA_TOMORROW' | 'STUCK' | 'TEST';
  text: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  shipment: { id: number; fileNo: string } | null;
}

export const notificationKeys = {
  status: ['notifications', 'whatsapp'] as const,
  groups: ['notifications', 'groups'] as const,
  log: (page: number) => ['notifications', 'log', page] as const,
};

export const notificationsApi = {
  link: () => api.post<{ state: WhatsappState }>('/notifications/whatsapp/link'),
  logout: () => api.post<{ state: WhatsappState }>('/notifications/whatsapp/logout'),
  setGroup: (group: { jid: string; name: string }) => api.patch('/notifications/whatsapp/group', group),
  test: () => api.post<{ queued: boolean }>('/notifications/test'),
  retry: () => api.post<{ count: number }>('/notifications/retry'),
};

/** Polled often while linking (the QR changes), slowly once linked. */
export function useWhatsappStatus() {
  return useQuery({
    queryKey: notificationKeys.status,
    queryFn: () => api.get<WhatsappStatus>('/notifications/whatsapp'),
    refetchInterval: (q) => (q.state.data?.state === 'CONNECTED' ? 20_000 : 3_000),
  });
}

export function useWhatsappGroups(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.groups,
    queryFn: () => api.get<WhatsappGroup[]>('/notifications/whatsapp/groups'),
    enabled,
  });
}

export function useNotificationLog(page: number) {
  return useQuery({
    queryKey: notificationKeys.log(page),
    queryFn: () => api.get<Page<NotificationRow>>('/notifications', { page, pageSize: 20 }),
    refetchInterval: 15_000,
  });
}
