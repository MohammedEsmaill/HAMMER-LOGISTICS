import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Approval, BankPaymentMethod } from './api';

export type AssetCategory = 'COMPUTER' | 'LAPTOP' | 'PRINTER' | 'SCANNER' | 'OTHER';
export type AssetStatus = 'ACTIVE' | 'SOLD' | 'SCRAPPED';

export const ASSET_CATEGORIES: Record<AssetCategory, string> = {
  COMPUTER: 'كمبيوتر',
  LAPTOP: 'لابتوب',
  PRINTER: 'طابعة',
  SCANNER: 'سكانر',
  OTHER: 'أخرى',
};

export const ASSET_STATUS: Record<AssetStatus, { label: string; tone: 'success' | 'muted' | 'danger' }> = {
  ACTIVE: { label: 'شغّال', tone: 'success' },
  SOLD: { label: 'اتباع', tone: 'muted' },
  SCRAPPED: { label: 'اتكهن', tone: 'danger' },
};

export const TX_KINDS = { PURCHASE: 'شراء', SALE: 'بيع', SCRAP: 'تكهين' } as const;
export type AssetTxKind = keyof typeof TX_KINDS;

/** Same as the API: below it a device is an expense. */
export const MIN_ASSET_COST = 2000;
export const DEFAULT_LIFE_MONTHS = 60;

export interface Depreciation {
  monthly: string;
  lastShare: string;
  monthsDone: number;
  monthsLeft: number;
  accumulated: string;
  netBookValue: string;
  fullyDepreciatedOn: string;
}

export interface AssetTx extends Approval {
  id: number;
  assetId: number;
  kind: AssetTxKind;
  amount: string;
  account: { id: number; name: string; type: 'CASH' | 'BANK'; currency: string } | null;
  paymentMethod: BankPaymentMethod | null;
  reference: string | null;
  bankCharges: string;
  party: string | null;
  invoiceNo: string | null;
  txDate: string;
  notes: string | null;
  asset?: { id: number; assetNo: string; name: string; category: AssetCategory; cost: string };
}

export interface FixedAsset {
  id: number;
  assetNo: string;
  category: AssetCategory;
  name: string;
  model: string | null;
  serialNo: string | null;
  location: string | null;
  custodianEmployeeId: number | null;
  custodian: { id: number; fullName: string; code: string } | null;
  acquisition: 'PURCHASED' | 'EXISTING';
  acquiredOn: string;
  cost: string;
  usefulLifeMonths: number;
  status: AssetStatus;
  disposedOn: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  depreciation: Depreciation;
  transactions?: AssetTx[];
}

export interface AssetsQuery {
  page: number;
  pageSize?: number;
  search?: string;
  category?: AssetCategory | '';
  status?: AssetStatus | '';
}

export interface AssetsPage {
  items: FixedAsset[];
  total: number;
  page: number;
  pageSize: number;
  totals: { count: number; cost: string; accumulated: string; netBookValue: string };
}

export const assetKeys = {
  all: ['finance', 'assets'] as const,
  list: (q: object) => ['finance', 'assets', 'list', q] as const,
  one: (id: number) => ['finance', 'assets', 'one', id] as const,
};

const clean = (q: object) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined));

export const useAssets = (q: AssetsQuery) =>
  useQuery({
    queryKey: assetKeys.list(q),
    queryFn: () => api.get<AssetsPage>('/finance/assets', clean(q) as Record<string, string | number>),
    placeholderData: keepPreviousData,
  });

export const useAsset = (id: number | null) =>
  useQuery({ queryKey: assetKeys.one(id ?? 0), queryFn: () => api.get<FixedAsset>(`/finance/assets/${id}`), enabled: !!id });

export interface AssetInfoInput {
  category: AssetCategory;
  name: string;
  model?: string;
  serialNo?: string;
  location?: string;
  custodianEmployeeId?: number;
  usefulLifeMonths?: number;
  notes?: string;
}

export const assetsApi = {
  existing: (input: AssetInfoInput & { acquiredOn: string; cost: number }) => api.post<FixedAsset>('/finance/assets/existing', input),
  purchase: (
    input: AssetInfoInput & {
      cost: number;
      accountId: number;
      paymentMethod?: BankPaymentMethod;
      bankCharges?: number;
      reference?: string;
      supplier?: string;
      invoiceNo?: string;
      purchaseDate?: string;
    },
  ) => api.post<FixedAsset>('/finance/assets/purchase', input),
  update: (
    id: number,
    input: Partial<Omit<AssetInfoInput, 'custodianEmployeeId'>> & {
      version: number;
      custodianEmployeeId?: number | null;
      acquiredOn?: string;
      cost?: number;
    },
  ) => api.patch<FixedAsset>(`/finance/assets/${id}`, input),
  dispose: (
    id: number,
    input: { kind: 'SALE' | 'SCRAP'; amount?: number; accountId?: number; paymentMethod?: BankPaymentMethod; reference?: string; buyer?: string; date?: string; notes: string },
  ) => api.post<FixedAsset>(`/finance/assets/${id}/dispose`, input),
  updateTx: (id: number, input: { version: number; amount?: number; date?: string; reference?: string; party?: string; invoiceNo?: string; notes?: string }) =>
    api.patch<AssetTx>(`/finance/asset-transactions/${id}`, input),
};
