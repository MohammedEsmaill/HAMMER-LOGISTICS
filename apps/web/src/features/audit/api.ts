import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';

export interface AuditRow {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  ref: string | null;
  ip: string | null;
  createdAt: string;
  user: { id: number; email: string; name: string | null } | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditQuery {
  tab: 'operations' | 'logins';
  userId?: number;
  action?: string;
  section?: string;
  from?: string;
  to?: string;
  search?: string;
  page: number;
  /** Rows per page (the user's choice). */
  pageSize?: number;
}

export const useAudit = (q: AuditQuery) =>
  useQuery({
    queryKey: ['audit', q],
    queryFn: () => api.get<Page<AuditRow>>('/audit', { pageSize: 50, ...q }),
    placeholderData: keepPreviousData,
  });

export const fetchAuditAll = (q: AuditQuery) => api.get<Page<AuditRow>>('/audit', { ...q, page: 1, pageSize: 5000 });

export const useAuditUsers = () =>
  useQuery({
    queryKey: ['audit', 'users'],
    queryFn: () => api.get<{ id: number; email: string; employee: { fullName: string } | null }[]>('/audit/users'),
    staleTime: 5 * 60_000,
  });

export const useShipmentHistory = (id: number) =>
  useQuery({ queryKey: ['audit', 'shipment', id], queryFn: () => api.get<AuditRow[]>(`/audit/shipments/${id}`) });
