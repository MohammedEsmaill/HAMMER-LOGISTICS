import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';

export const QUOTE_FIELDS = [
  { key: 'quoteFinalBase', label: 'أساس الوارد النهائي' },
  { key: 'quoteTemporaryBase', label: 'أساس الوارد سماح مؤقت' },
  { key: 'quoteImportExtraContainer', label: 'الحاوية الإضافية (وارد)' },
  { key: 'quoteExportBase', label: 'أساس الصادر' },
  { key: 'quoteExportExtraContainer', label: 'الحاوية الإضافية (صادر)' },
] as const;
export type QuoteKey = (typeof QUOTE_FIELDS)[number]['key'];

export interface Factory {
  id: number;
  clientId: number;
  name: string;
  taxNumber: string;
  commercialRegister: string;
  address: string;
}

export interface Client extends Partial<Record<QuoteKey, string>> {
  id: number;
  name: string;
  mobile: string;
  email: string;
  importOperationEmployee: { id: number; fullName: string };
  exportOperationEmployee: { id: number; fullName: string } | null;
  factories?: Factory[];
  _count?: { factories: number };
}

export type FactoryInput = Omit<Factory, 'id' | 'clientId'>;

export interface ClientInput extends Record<QuoteKey, number> {
  name: string;
  mobile: string;
  email: string;
  importOperationEmployeeId: number;
  exportOperationEmployeeId: number | null;
  factories?: FactoryInput[];
}

export const clientKeys = {
  all: ['clients'] as const,
  list: (search: string, page: number) => ['clients', 'list', search, page] as const,
  one: (id: number) => ['clients', 'one', id] as const,
};

export const useClients = (search: string, page: number) =>
  useQuery({
    queryKey: clientKeys.list(search, page),
    queryFn: () => api.get<Page<Client>>('/clients', { search, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export const useClient = (id: number | null) =>
  useQuery({
    queryKey: clientKeys.one(id ?? 0),
    queryFn: () => api.get<Client>(`/clients/${id}`),
    enabled: !!id,
  });

export const clientsApi = {
  create: (input: ClientInput) => api.post<Client>('/clients', input),
  update: (id: number, input: Partial<ClientInput>) => api.patch<Client>(`/clients/${id}`, input),
  remove: (id: number) => api.delete(`/clients/${id}`),
  addFactory: (clientId: number, input: FactoryInput) =>
    api.post<Factory>(`/clients/${clientId}/factories`, input),
  updateFactory: (id: number, input: Partial<FactoryInput>) => api.patch<Factory>(`/factories/${id}`, input),
  removeFactory: (id: number) => api.delete(`/factories/${id}`),
};
