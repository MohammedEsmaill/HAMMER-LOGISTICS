import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export type DocStatus = 'VALID' | 'EXPIRING' | 'EXPIRED';

export interface FactoryInfo {
  id: number;
  name: string;
  taxNumber: string;
  commercialRegister: string;
  address: string;
}

export interface PartyCard {
  key: string;
  client: { id: number; name: string };
  /** set when the client has several factories: the card is this factory's */
  factory: FactoryInfo | null;
  /** the factory data shown on the card (the only factory, or this one) */
  details: FactoryInfo | null;
  counts: Record<DocStatus, number>;
  total: number;
}

export interface PartyDoc {
  id: number;
  clientId: number;
  factoryId: number | null;
  title: string | null;
  number: string | null;
  issueDate: string;
  expiryDate: string;
  notes: string | null;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  type: { id: number; name: string };
  createdBy: { email: string };
  updatedBy: { email: string } | null;
  status: DocStatus;
  daysLeft: number;
}

export interface DocWarning {
  name: string;
  expiryDate: string;
  status: DocStatus;
  daysLeft: number;
}

export const STATUS: Record<DocStatus, { label: string; tone: 'success' | 'gold' | 'danger' }> = {
  VALID: { label: 'ساري', tone: 'success' },
  EXPIRING: { label: 'ينتهي قريبًا', tone: 'gold' },
  EXPIRED: { label: 'منتهي', tone: 'danger' },
};

export const OTHER_TYPE = 'أخرى';

export const docKeys = {
  all: ['party-documents'] as const,
  cards: (search: string) => ['party-documents', 'cards', search] as const,
  list: (clientId: number, factoryId: number | null) => ['party-documents', 'list', clientId, factoryId] as const,
};

export const useDocTypes = () =>
  useQuery({ queryKey: ['party-documents', 'types'], queryFn: () => api.get<{ id: number; name: string }[]>('/party-documents/types'), staleTime: 5 * 60_000 });

export const useCards = (search: string) =>
  useQuery({ queryKey: docKeys.cards(search), queryFn: () => api.get<PartyCard[]>('/party-documents/cards', { search }) });

export const usePartyDocs = (clientId: number | null, factoryId: number | null) =>
  useQuery({
    queryKey: docKeys.list(clientId ?? 0, factoryId),
    queryFn: () => api.get<PartyDoc[]>('/party-documents', { clientId, factoryId }),
    enabled: !!clientId,
  });

/** For the registration form: papers of the chosen client (and factory) that need renewing. */
export const useDocWarnings = (clientId: number | undefined, factoryId: number | undefined) =>
  useQuery({
    queryKey: ['party-documents', 'warnings', clientId, factoryId],
    queryFn: () => api.get<DocWarning[]>('/party-documents/warnings', { clientId, factoryId }),
    enabled: !!clientId,
  });

export const docsApi = {
  save: (id: number | null, form: FormData) =>
    id ? api.upload<PartyDoc>(`/party-documents/${id}`, form, 'PATCH') : api.upload<PartyDoc>('/party-documents', form),
  remove: (id: number) => api.delete(`/party-documents/${id}`),
};
