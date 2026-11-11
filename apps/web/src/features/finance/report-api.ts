import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { financeKeys, STATUS, type ApprovalStatus, type Currency, type MoneyAccount } from './api';
import { JOURNAL_TYPES, journalParams, type JournalRow, type JournalTotals, type JournalType } from './journal-api';

export type ReportKind = 'journal' | 'accounts' | 'expenses';

export const REPORT_KINDS: Record<ReportKind, { title: string; hint: string }> = {
  journal: { title: 'تقرير اليوميات', hint: 'كل المعاملات في الفترة، وملخصها بالنوع والعملة' },
  accounts: { title: 'تقرير الخزن والحسابات البنكية', hint: 'رصيد أول المدة والوارد والمنصرف ورصيد آخر المدة لكل حساب، وحركته' },
  expenses: { title: 'تقرير المصاريف العمومية', hint: 'إجمالي كل بند مصروف في الفترة، وكل مصروف بالتفصيل' },
};

/** What a report is asked for: the period and the journal filters. */
export interface ReportQuery {
  from: string;
  to: string;
  types?: JournalType[];
  accountId?: number | '';
  currency?: Currency | '';
  status?: ApprovalStatus | '';
}

interface ReportHead {
  kind: ReportKind;
  from: string;
  to: string;
  generatedAt: string;
  truncated: boolean;
}

export interface TypeTotal {
  type: JournalType;
  currency: Currency;
  in: string;
  out: string;
  moved: string;
  count: number;
}

export interface JournalReport extends ReportHead {
  kind: 'journal';
  summary: { totals: JournalTotals[]; byType: TypeTotal[] };
  rows: JournalRow[];
}

export interface ExpensesReport extends ReportHead {
  kind: 'expenses';
  summary: { totals: JournalTotals[]; byItem: { name: string; currency: Currency; total: string; count: number }[] };
  rows: JournalRow[];
}

export interface AccountLine {
  id: string;
  date: string;
  direction: 'IN' | 'OUT';
  amount: string;
  source: JournalType;
  reversal: boolean;
  ref: string | null;
  description: string | null;
  counterparty: string | null;
  fileNo: string | null;
  balance: string;
}

export interface AccountSection {
  account: Pick<MoneyAccount, 'id' | 'name' | 'type' | 'currency' | 'bankName' | 'accountNumber'>;
  opening: string;
  in: string;
  out: string;
  closing: string;
  lines: AccountLine[];
}

export interface AccountsReport extends ReportHead {
  kind: 'accounts';
  summary: { accounts: Omit<AccountSection, 'lines'>[] };
  accounts: AccountSection[];
}

export type Report = JournalReport | ExpensesReport | AccountsReport;

export const useReport = (kind: ReportKind, q: ReportQuery | null) =>
  useQuery({
    queryKey: [...financeKeys.all, 'report', kind, q] as const,
    queryFn: () => api.get<Report>(`/finance/journal/reports/${kind}`, journalParams(q!)),
    enabled: !!q,
  });

/** The query as URL search params (the print page reads them back). */
export function reportSearch(q: ReportQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(journalParams(q))) params.set(k, String(v));
  return params.toString();
}

export function readReportSearch(params: URLSearchParams): ReportQuery | null {
  const from = params.get('from');
  const to = params.get('to');
  if (!from || !to) return null;
  const types = params.get('types');
  return {
    from,
    to,
    types: types ? (types.split(',') as JournalType[]) : [],
    accountId: params.get('accountId') ? Number(params.get('accountId')) : '',
    currency: (params.get('currency') as Currency | null) ?? '',
    status: (params.get('status') as ApprovalStatus | null) ?? '',
  };
}

/** The filters in words, for the report's head. */
export function describeFilters(q: ReportQuery, accounts: MoneyAccount[]): string[] {
  const out: string[] = [];
  if (q.types?.length) out.push(`النوع: ${q.types.map((t) => JOURNAL_TYPES[t].label).join('، ')}`);
  if (q.accountId) out.push(`الحساب: ${accounts.find((a) => a.id === q.accountId)?.name ?? q.accountId}`);
  if (q.currency) out.push(`العملة: ${q.currency === 'EGP' ? 'جنيه' : 'دولار'}`);
  if (q.status) out.push(`الحالة: ${STATUS[q.status].label}`);
  return out;
}
