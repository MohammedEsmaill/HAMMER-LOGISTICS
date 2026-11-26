import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Currency } from './api';

export type GlType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export const GL_TYPES: Record<GlType, string> = {
  ASSET: 'أصول',
  LIABILITY: 'التزامات',
  EQUITY: 'حقوق ملكية',
  REVENUE: 'إيرادات',
  EXPENSE: 'مصروفات',
};

/** Where the account's balance grows: assets and expenses on the debit side. */
export const DEBIT_NATURE: ReadonlySet<GlType> = new Set(['ASSET', 'EXPENSE']);

export interface GlAccount {
  key: string;
  code: string;
  name: string;
  type: GlType;
  parent: string | null;
  group: boolean;
}

export interface TrialLine extends GlAccount {
  level: number;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
  closingDebit: string;
  closingCredit: string;
}

export interface TrialBalance {
  currency: Currency;
  lines: TrialLine[];
  unknown: string[];
  totals: { debit: string; credit: string; closingDebit: string; closingCredit: string };
}

export interface GlLedgerLine {
  date: string;
  sourceType: string;
  sourceId: number;
  ref: string;
  description: string;
  party: string | null;
  fileNo: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface GlLedger {
  account: GlAccount;
  currency: Currency;
  opening: string;
  lines: GlLedgerLine[];
  closing: string;
}

export interface GlPeriod {
  currency: Currency;
  from: string;
  to: string;
}

const params = (q: GlPeriod, extra: Record<string, string> = {}) =>
  new URLSearchParams(
    Object.entries({ currency: q.currency, from: q.from, to: q.to, ...extra }).filter(([, v]) => v) as [string, string][],
  ).toString();

export const glKeys = {
  all: ['finance', 'gl'] as const,
  chart: ['finance', 'gl', 'chart'] as const,
  trial: (q: GlPeriod) => ['finance', 'gl', 'trial', q] as const,
  ledger: (key: string, q: GlPeriod) => ['finance', 'gl', 'ledger', key, q] as const,
};

export const useGlChart = () => useQuery({ queryKey: glKeys.chart, queryFn: () => api.get<GlAccount[]>('/finance/gl/accounts') });

export const useTrialBalance = (q: GlPeriod) =>
  useQuery({ queryKey: glKeys.trial(q), queryFn: () => api.get<TrialBalance>(`/finance/gl/trial-balance?${params(q)}`) });

export const useGlLedger = (key: string | null, q: GlPeriod) =>
  useQuery({
    queryKey: glKeys.ledger(key ?? '', q),
    queryFn: () => api.get<GlLedger>(`/finance/gl/ledger?${params(q, { account: key ?? '' })}`),
    enabled: !!key,
  });

export interface StatementLine {
  key: string;
  code: string;
  name: string;
  level: number;
  group: boolean;
  amount: string;
}

export interface StatementSection {
  lines: StatementLine[];
  total: string;
}

export interface IncomeStatement {
  currency: Currency;
  revenues: StatementSection;
  expenses: StatementSection;
  net: string;
  margin: string | null;
}

export interface BalanceSheet {
  currency: Currency;
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  totalLiabilitiesAndEquity: string;
  balanced: boolean;
}

export interface VatReport {
  currency: Currency;
  rates: { rate: string; count: number; subtotal: string; vat: string; total: string }[];
  totals: { count: number; subtotal: string; vat: string; total: string };
  invoices: {
    id: number;
    invoiceNo: string;
    date: string;
    client: string;
    fileNo: string;
    shipmentId: number;
    rate: string;
    subtotal: string;
    vat: string;
    total: string;
  }[];
}

export const useIncomeStatement = (q: GlPeriod) =>
  useQuery({ queryKey: [...glKeys.all, 'income', q], queryFn: () => api.get<IncomeStatement>(`/finance/gl/income-statement?${params(q)}`) });

export const useBalanceSheet = (q: GlPeriod) =>
  useQuery({
    queryKey: [...glKeys.all, 'balance', q.currency, q.to],
    queryFn: () =>
      api.get<BalanceSheet>(`/finance/gl/balance-sheet?${new URLSearchParams({ currency: q.currency, ...(q.to ? { asOf: q.to } : {}) })}`),
  });

export const useVatReport = (q: GlPeriod) =>
  useQuery({ queryKey: [...glKeys.all, 'vat', q], queryFn: () => api.get<VatReport>(`/finance/gl/vat?${params(q)}`) });
