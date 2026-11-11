import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';

export type Currency = 'EGP' | 'USD';
export type ApprovalStatus = 'PENDING' | 'REVIEWED' | 'MANAGER_APPROVED' | 'APPROVED' | 'REJECTED';
export type OtherKind = 'FUNDING' | 'BANK_CHARGES' | 'ADJUSTMENT';
export type Direction = 'IN' | 'OUT';
export type DocType = 'TRANSFER' | 'OTHER' | 'SALARY' | 'ADVANCE' | 'EXPENSE' | 'CUSTODY' | 'FEE_ADJUSTMENT' | 'FEE_PAYMENT' | 'INVOICE' | 'COLLECTION';

export const CURRENCIES: Record<Currency, { label: string; symbol: string }> = {
  EGP: { label: 'جنيه', symbol: 'ج' },
  USD: { label: 'دولار', symbol: '$' },
};

export const STATUS: Record<ApprovalStatus, { label: string; tone: 'muted' | 'gold' | 'success' | 'danger' }> = {
  PENDING: { label: 'مستنية المراجعة', tone: 'muted' },
  REVIEWED: { label: 'اتراجعت', tone: 'gold' },
  MANAGER_APPROVED: { label: 'وافق مدير الحسابات', tone: 'gold' },
  APPROVED: { label: 'معتمدة', tone: 'success' },
  REJECTED: { label: 'مرفوضة', tone: 'danger' },
};

export const OTHER_KINDS: Record<OtherKind, string> = {
  FUNDING: 'تمويل من الإدارة',
  BANK_CHARGES: 'مصاريف بنكية',
  ADJUSTMENT: 'تسوية',
};

export interface MoneyAccount {
  id: number;
  name: string;
  type: 'CASH' | 'BANK';
  currency: Currency;
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
}

interface AccountRef {
  id: number;
  name: string;
  type: 'CASH' | 'BANK';
  currency: Currency;
}
interface UserRef {
  id: number;
  email: string;
}

export interface Approval {
  approvalStatus: ApprovalStatus;
  version: number;
  createdAt: string;
  createdBy: UserRef;
  reviewedBy?: UserRef | null;
  reviewedAt?: string | null;
  managerBy?: UserRef | null;
  managerAt?: string | null;
  approvedBy?: UserRef | null;
  approvedAt?: string | null;
  rejectedBy?: UserRef | null;
  rejectedAt?: string | null;
  rejectionReason: string | null;
}

export interface Transfer extends Approval {
  id: number;
  fromAccount: AccountRef;
  toAccount: AccountRef;
  currency: Currency;
  amount: string;
  chequeNo: string | null;
  transferDate: string;
  notes: string | null;
}

export interface OtherMovement extends Approval {
  id: number;
  account: AccountRef;
  kind: OtherKind;
  direction: Direction;
  amount: string;
  reason: string;
  movementDate: string;
}

export interface LedgerLine {
  id: string;
  direction: Direction;
  amount: string;
  balanceAfter: string;
  movementDate: string;
  createdAt: string;
  source: DocType;
  sourceLabel: string;
  reversalOfId: string | null;
  createdBy: UserRef;
  transfer: { id: number; chequeNo: string | null; notes: string | null; fromAccount: { id: number; name: string }; toAccount: { id: number; name: string } } | null;
  otherMovement: { id: number; kind: OtherKind; reason: string } | null;
  salary: { id: number; salaryMonth: string; employee: { id: number; fullName: string } } | null;
  advance: { id: number; employee: { id: number; fullName: string } } | null;
  expense: { id: number; payee: string; receiptNo: string; expenseType: { name: string } } | null;
  custody: { id: number; custodyNo: string; holderType: string; shipment: { fileNo: string } } | null;
  feePayment: { id: number; fee: { clearer: { fullName: string }; shipment: { fileNo: string } } } | null;
  collection: { id: number; client: { name: string }; shipment: { fileNo: string } } | null;
}

export interface Ledger extends Page<LedgerLine> {
  account: MoneyAccount;
  totals: { in: string; out: string };
}

export interface Operation {
  type: DocType;
  typeLabel: string;
  id: number;
  currency: Currency;
  amount: string;
  date: string;
  approvalStatus: ApprovalStatus;
  createdBy: UserRef;
  createdAt: string;
  version: number;
  rejectionReason: string | null;
  /** FINAL_ONLY: salaries and advances, approved by the general auditor alone. */
  flow: 'THREE_LEVELS' | 'FINAL_ONLY';
  canAct: boolean;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export const financeKeys = {
  all: ['finance'] as const,
  accounts: ['finance', 'accounts'] as const,
  ledger: (id: number, q: DateRange & { page: number }) => ['finance', 'ledger', id, q] as const,
  transfers: (q: object) => ['finance', 'transfers', q] as const,
  others: (q: object) => ['finance', 'others', q] as const,
  approvals: (q: object) => ['finance', 'approvals', q] as const,
  doc: (type: DocType, id: number) => ['finance', 'doc', type, id] as const,
};

export const useAccounts = () =>
  useQuery({ queryKey: financeKeys.accounts, queryFn: () => api.get<MoneyAccount[]>('/finance/accounts') });

export const useLedger = (id: number | null, q: DateRange & { page: number }) =>
  useQuery({
    queryKey: financeKeys.ledger(id ?? 0, q),
    queryFn: () => api.get<Ledger>(`/finance/accounts/${id}/movements`, { ...q, pageSize: 30 }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

export interface MovementsQuery extends DateRange {
  status?: ApprovalStatus | '';
  accountId?: number | '';
  page: number;
}

export const useTransfers = (q: MovementsQuery) =>
  useQuery({
    queryKey: financeKeys.transfers(q),
    queryFn: () => api.get<Page<Transfer>>('/finance/transfers', { ...q, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

export const useOtherMovements = (q: MovementsQuery) =>
  useQuery({
    queryKey: financeKeys.others(q),
    queryFn: () => api.get<Page<OtherMovement>>('/finance/other-movements', { ...q, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

export interface ApprovalsQuery extends DateRange {
  status?: ApprovalStatus | '';
  type?: DocType | '';
  mine?: boolean;
  page: number;
}

export const useApprovals = (q: ApprovalsQuery) =>
  useQuery({
    queryKey: financeKeys.approvals(q),
    queryFn: () => api.get<Page<Operation>>('/finance/approvals', { ...q, mine: q.mine || undefined, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

const DOC_PATH: Record<DocType, string> = {
  TRANSFER: '/finance/transfers',
  OTHER: '/finance/other-movements',
  SALARY: '/finance/salaries',
  ADVANCE: '/finance/advances',
  EXPENSE: '/finance/expenses',
  CUSTODY: '/finance/custodies',
  FEE_ADJUSTMENT: '/finance/clearer-fees/adjustments',
  FEE_PAYMENT: '/finance/clearer-fees/payments',
  INVOICE: '/finance/invoices',
  COLLECTION: '/finance/collections',
};

/** One financial document in full (with its approval trail), for its drawer. */
export const useDocument = <T = Transfer | OtherMovement>(type: DocType, id: number | null) =>
  useQuery({
    queryKey: financeKeys.doc(type, id ?? 0),
    queryFn: () => api.get<T>(`${DOC_PATH[type]}/${id}`),
    enabled: !!id,
  });

export interface TransferInput {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  chequeNo?: string | null;
  transferDate?: string;
  notes?: string | null;
}

export interface OtherInput {
  accountId: number;
  kind: OtherKind;
  direction?: Direction;
  amount: number;
  reason: string;
  movementDate?: string;
}

export type ApprovalAction = 'review' | 'manager-approve' | 'approve' | 'reject';

export const financeApi = {
  createBank: (input: { name: string; bankName: string; accountNumber: string; currency: Currency; openingBalance: number }) =>
    api.post<MoneyAccount>('/finance/accounts', input),
  updateAccount: (id: number, input: Partial<{ name: string; bankName: string; accountNumber: string; openingBalance: number; isActive: boolean }>) =>
    api.patch<MoneyAccount>(`/finance/accounts/${id}`, input),
  createTransfer: (input: TransferInput) => api.post<Transfer>('/finance/transfers', input),
  updateTransfer: (id: number, input: Partial<TransferInput> & { version: number }) =>
    api.patch<Transfer>(`/finance/transfers/${id}`, input),
  createOther: (input: OtherInput) => api.post<OtherMovement>('/finance/other-movements', input),
  updateOther: (id: number, input: { version: number; amount?: number; reason?: string; movementDate?: string }) =>
    api.patch<OtherMovement>(`/finance/other-movements/${id}`, input),
  act: (type: DocType, id: number, action: ApprovalAction, version: number, reason?: string) =>
    api.post<{ approvalStatus: ApprovalStatus; version: number }>(`/finance/approvals/${type}/${id}/${action}`, { version, reason }),
};

/** "12500.5" → "12,500.50 ج" */
export function money(value: string | number | null | undefined, currency?: Currency): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  return currency ? `${text} ${CURRENCIES[currency].symbol}` : text;
}

export const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
