import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';

export const PRICE_FIELDS = [
  { key: 'importFinalBase', label: 'أساس الوارد النهائي' },
  { key: 'importTemporaryBase', label: 'أساس الوارد سماح مؤقت' },
  { key: 'importExtraContainer', label: 'الحاوية الإضافية (وارد)' },
  { key: 'exportBase', label: 'أساس الصادر' },
  { key: 'exportExtraContainer', label: 'الحاوية الإضافية (صادر)' },
] as const;

export type PriceKey = (typeof PRICE_FIELDS)[number]['key'];

export interface Clearer extends Record<PriceKey, string> {
  id: number;
  fullName: string;
  phone: string;
  nationalId: string;
  customsOffices: string[];
  isActive: boolean;
  notes: string | null;
}

export type Prices = Record<PriceKey, number>;

export interface ClearerData {
  fullName: string;
  phone: string;
  nationalId: string;
  customsOffices: string[];
  notes?: string;
}

export const clearerKeys = {
  all: ['clearers'] as const,
  list: (search: string, page: number) => ['clearers', 'list', search, page] as const,
  options: ['clearers', 'options'] as const,
};

export const useClearers = (search: string, page: number) =>
  useQuery({
    queryKey: clearerKeys.list(search, page),
    queryFn: () => api.get<Page<Clearer>>('/clearers', { search, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export const clearersApi = {
  create: (input: ClearerData & Prices) => api.post<Clearer>('/clearers', input),
  update: (id: number, input: Partial<ClearerData> & { isActive?: boolean }) =>
    api.patch<Clearer>(`/clearers/${id}`, input),
  updatePrices: (id: number, prices: Prices) => api.patch<Clearer>(`/clearers/${id}/prices`, prices),
  remove: (id: number) => api.delete(`/clearers/${id}`),
};
