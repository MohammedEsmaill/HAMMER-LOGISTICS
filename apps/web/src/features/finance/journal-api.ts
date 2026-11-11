import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';
import { financeKeys, today, type ApprovalStatus, type Currency } from './api';

export type JournalType = 'TRANSFER' | 'OTHER' | 'SALARY' | 'ADVANCE' | 'EXPENSE' | 'CUSTODY' | 'FEE_PAYMENT' | 'COLLECTION';
export type Flow = 'IN' | 'OUT' | 'MOVE';

export const JOURNAL_TYPES: Record<JournalType, { label: string; restricted?: boolean }> = {
  TRANSFER: { label: 'تحويل' },
  OTHER: { label: 'معاملة أخرى' },
  EXPENSE: { label: 'مصروف عمومي' },
  CUSTODY: { label: 'عهدة' },
  FEE_PAYMENT: { label: 'أتعاب مستخلص' },
  COLLECTION: { label: 'تحصيل من عميل' },
  SALARY: { label: 'مرتب', restricted: true },
  ADVANCE: { label: 'سلفة', restricted: true },
};

export const FLOWS: Record<Flow, { label: string; tone: 'success' | 'danger' | 'gold' }> = {
  IN: { label: 'وارد', tone: 'success' },
  OUT: { label: 'منصرف', tone: 'danger' },
  MOVE: { label: 'تحويل', tone: 'gold' },
};

interface Named {
  id: number;
  name: string;
}

export interface JournalRow {
  type: JournalType;
  id: number;
  ref: string;
  operationDate: string;
  currency: Currency;
  amount: string;
  flow: Flow;
  fromAccount: Named | null;
  toAccount: Named | null;
  counterparty: string | null;
  fileNo: string | null;
  description: string;
  approvalStatus: ApprovalStatus;
  createdBy: { id: number; email: string };
  createdAt: string;
}

export interface JournalTotals {
  currency: Currency;
  in: string;
  out: string;
  count: number;
}

export interface JournalQuery {
  page: number;
  from?: string;
  to?: string;
  types?: JournalType[];
  accountId?: number | '';
  currency?: Currency | '';
  status?: ApprovalStatus | '';
  flow?: Flow | '';
  createdBy?: number | '';
  search?: string;
}

export const JOURNAL_PAGE_SIZE = 50;

/** The query string the API takes: empty filters left out, types comma separated. */
export function journalParams(q: Omit<JournalQuery, 'page'> & { page?: number; pageSize?: number }) {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    params[key] = Array.isArray(value) ? value.join(',') : (value as string | number);
  }
  return params;
}

export const journalKeys = {
  list: (q: JournalQuery) => [...financeKeys.all, 'journal', q] as const,
  authors: [...financeKeys.all, 'journal', 'authors'] as const,
};

export const useJournal = (q: JournalQuery) =>
  useQuery({
    queryKey: journalKeys.list(q),
    queryFn: () =>
      api.get<Page<JournalRow> & { totals: JournalTotals[] }>('/finance/journal', journalParams({ ...q, pageSize: JOURNAL_PAGE_SIZE })),
    placeholderData: keepPreviousData,
  });

export const useJournalAuthors = () =>
  useQuery({
    queryKey: journalKeys.authors,
    queryFn: () => api.get<{ id: number; email: string }[]>('/finance/journal/authors'),
    staleTime: 60_000,
  });

/* ---------- periods (journal filter and reports) ---------- */

export type PeriodKind = 'day' | 'month' | 'year' | 'range';

export const PERIOD_KINDS: Record<PeriodKind, string> = {
  day: 'يومي',
  month: 'شهري',
  year: 'سنوي',
  range: 'فترة',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** The first and last day of a day, a month (YYYY-MM) or a year (YYYY). */
export function periodRange(kind: PeriodKind, value: string, to?: string): { from: string; to: string } | null {
  if (!value) return null;
  if (kind === 'day') return { from: value, to: value };
  if (kind === 'month') {
    const [y, m] = value.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
  }
  if (kind === 'year') return { from: `${value}-01-01`, to: `${value}-12-31` };
  return to ? { from: value, to } : null;
}

/** Where each kind of period starts: today, this month, this year. */
export function defaultPeriodValue(kind: PeriodKind): string {
  const t = today();
  if (kind === 'month') return t.slice(0, 7);
  if (kind === 'year') return t.slice(0, 4);
  return t;
}
