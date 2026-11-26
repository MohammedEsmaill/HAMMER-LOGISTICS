import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Currency } from './api';

// ── closing the months ───────────────────────────────────────────────────────────

export interface MonthFigures {
  revenues: string;
  expenses: string;
  net: string;
}

export interface FiscalMonth {
  month: string;
  /** CURRENT: the month we are in (cannot close yet) */
  status: 'CLOSED' | 'OPEN' | 'CURRENT';
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  figures: Record<Currency, MonthFigures>;
  /** what moved after it closed (the CEO's edits) */
  changedSinceClose: string[];
}

export interface MonthIssue {
  kind: string;
  title: string;
  detail?: string;
  link?: string;
}

export interface MonthCheck {
  month: string;
  from: string;
  to: string;
  blockers: MonthIssue[];
  warnings: MonthIssue[];
  figures: Record<Currency, MonthFigures>;
}

export const closeKeys = {
  months: ['finance', 'months'] as const,
  check: (m: string) => ['finance', 'months', m, 'check'] as const,
  recon: ['finance', 'reconciliations'] as const,
};

export const useMonths = () => useQuery({ queryKey: closeKeys.months, queryFn: () => api.get<FiscalMonth[]>('/finance/months') });

export const useMonthCheck = (month: string | null) =>
  useQuery({ queryKey: closeKeys.check(month ?? ''), queryFn: () => api.get<MonthCheck>(`/finance/months/${month}/check`), enabled: !!month });

export const monthsApi = {
  close: (month: string) => api.post<{ month: string }>(`/finance/months/${month}/close`, {}),
  reopen: (month: string, reason: string) => api.post<{ month: string }>(`/finance/months/${month}/reopen`, { reason }),
};

const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** "2026-11" → "نوفمبر 2026" */
export const monthName = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

// ── bank reconciliation ──────────────────────────────────────────────────────────

export type ReconStatus = 'MATCHED' | 'DIFFERENCE';

export interface ReconAccount {
  id: number;
  name: string;
  currency: Currency;
  bankName: string | null;
  isActive: boolean;
  last: { id: number; to: string; status: ReconStatus } | null;
}

export interface ReconLine {
  key: string;
  date: string;
  sourceType: string;
  sourceId: number;
  ref: string;
  description: string;
  party: string | null;
  fileNo: string | null;
  /** + in, − out */
  amount: string;
  /** dated before the period: left outstanding by an earlier reconciliation */
  prior: boolean;
  cleared: boolean;
}

export interface ReconDraft {
  account: { id: number; name: string; currency: Currency };
  from: string;
  to: string;
  last: { id: number; to: string; status: ReconStatus; statementBalance: string } | null;
  systemBalance: string;
  lines: ReconLine[];
}

export interface BankLine {
  date: string;
  description: string;
  /** + into the account, − out of it */
  amount: number;
  balance?: number | null;
}

export interface Reconciliation {
  id: number;
  accountId: number;
  account: { id: number; name: string; currency: Currency };
  fromDate: string;
  toDate: string;
  statementBalance: string;
  systemBalance: string;
  outstandingIn: string;
  outstandingOut: string;
  difference: string;
  status: ReconStatus;
  note: string | null;
  bankLines: BankLine[] | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy?: string | null;
  latest: boolean;
  clearedCount?: number;
  lines?: ReconLine[];
}

export interface ReconSave {
  statementBalance: number;
  clearedKeys: string[];
  note?: string;
  bankLines?: BankLine[];
}

export type QuickKind = 'BANK_CHARGES' | 'INTEREST' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export const QUICK_KINDS: Record<QuickKind, { label: string; sign: 1 | -1 }> = {
  BANK_CHARGES: { label: 'مصاريف بنكية', sign: -1 },
  INTEREST: { label: 'فوايد دائنة', sign: 1 },
  ADJUSTMENT_IN: { label: 'تسوية (وارد)', sign: 1 },
  ADJUSTMENT_OUT: { label: 'تسوية (منصرف)', sign: -1 },
};

export const useReconAccounts = () =>
  useQuery({ queryKey: [...closeKeys.recon, 'accounts'], queryFn: () => api.get<ReconAccount[]>('/finance/reconciliations/accounts') });

export const useReconciliations = (q: { accountId?: number | ''; status?: ReconStatus | '' }) =>
  useQuery({
    queryKey: [...closeKeys.recon, 'list', q],
    queryFn: () =>
      api.get<Reconciliation[]>(
        `/finance/reconciliations?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [k, String(v)]))}`,
      ),
  });

export const useReconDraft = (q: { accountId: number | null; from: string; to: string } | null) =>
  useQuery({
    queryKey: [...closeKeys.recon, 'draft', q],
    queryFn: () =>
      api.get<ReconDraft>(
        `/finance/reconciliations/draft?${new URLSearchParams({ accountId: String(q!.accountId), ...(q!.from ? { from: q!.from } : {}), ...(q!.to ? { to: q!.to } : {}) })}`,
      ),
    enabled: !!q?.accountId,
  });

export const useReconciliation = (id: number | null) =>
  useQuery({ queryKey: [...closeKeys.recon, 'one', id], queryFn: () => api.get<Reconciliation>(`/finance/reconciliations/${id}`), enabled: !!id });

export const reconApi = {
  create: (body: ReconSave & { accountId: number; from: string; to: string }) =>
    api.post<{ id: number; status: ReconStatus; difference: string }>('/finance/reconciliations', body),
  update: (id: number, body: ReconSave & { version: number }) =>
    api.put<{ id: number; status: ReconStatus; difference: string }>(`/finance/reconciliations/${id}`, body),
  remove: (id: number) => api.delete(`/finance/reconciliations/${id}`),
  record: (body: { accountId: number; kind: QuickKind; amount: number; date?: string; reason: string }) =>
    api.post<{ id: number }>('/finance/reconciliations/record', body),
};
