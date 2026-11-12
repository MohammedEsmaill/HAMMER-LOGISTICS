import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';
import type { Approval, ApprovalStatus, Currency } from './api';

export type HolderType = 'AGENT' | 'WAY_OUT' | 'CLEARER' | 'BANK_TRANSFER';
export type Purpose = 'UNLOADING' | 'RELEASE' | 'STORAGE' | 'CLEARANCE';

/** Mirror of the API rules (custodies.service.ts HOLDERS). */
export const HOLDERS: Record<HolderType, { label: string; purposes: Purpose[] | null; overspend: boolean; source: string }> = {
  AGENT: { label: 'مندوب توكيلات', purposes: ['UNLOADING', 'RELEASE', 'STORAGE'], overspend: false, source: 'خزنة الجنيه' },
  WAY_OUT: { label: 'إيداع دولاري', purposes: ['UNLOADING', 'RELEASE', 'STORAGE'], overspend: false, source: 'خزنة الدولار' },
  CLEARER: { label: 'مستخلص الشحنة', purposes: ['CLEARANCE', 'RELEASE'], overspend: true, source: 'خزنة الجنيه' },
  BANK_TRANSFER: { label: 'تحويل بنكي', purposes: null, overspend: false, source: 'حساب بنكي' },
};

export const PURPOSES: Record<Purpose, string> = {
  UNLOADING: 'تفريغ',
  RELEASE: 'صرف',
  STORAGE: 'أرضيات',
  CLEARANCE: 'تخليص',
};

export interface CustodyItem {
  id: number;
  lineNo: number;
  expenseType: { id: number; name: string };
  /** a fixed-price item of the price list (clearer custodies), with its quantity */
  settlementItemId: number | null;
  quantity: number;
  amount: string;
  receiptNo: string | null;
  receiptKind: ReceiptKind | null;
  description: string | null;
}

export type ReceiptKind = 'PAYMENT_RECEIPT' | 'PAYMENT' | 'VAT';
/** How each receipt kind prints on the statement (same as the API). */
export const RECEIPT_KINDS: Record<ReceiptKind, { label: string; line: (no: string) => string }> = {
  PAYMENT_RECEIPT: { label: 'PAYMENT RECEIPT', line: (no) => `PAYMENT RECEIPT NO-${no}` },
  PAYMENT: { label: 'PAYMENT', line: (no) => `PAYMENT NO ${no}` },
  VAT: { label: 'VAT', line: (no) => `VAT NO-${no}` },
};

export interface Custody extends Approval {
  id: number;
  custodyNo: string;
  shipment: { id: number; fileNo: string; clearerId: number; client: { id: number; name: string } };
  holderType: HolderType;
  agent: { id: number; fullName: string; code: string } | null;
  clearer: { id: number; fullName: string } | null;
  purpose: Purpose | null;
  sourceAccount: { id: number; name: string; type: 'CASH' | 'BANK'; currency: Currency };
  beneficiary: { id: number; name: string; kind: string; bankName: string; accountNumber: string } | null;
  transferRef: string | null;
  currency: Currency;
  amount: string;
  extraAmount: string;
  spentAmount: string;
  returnedAmount: string;
  status: 'OPEN' | 'SETTLED';
  issueDate: string;
  settlementDate: string | null;
  settledBy: { id: number; email: string } | null;
  notes: string | null;
  computedFee: { id: number; amount: string } | null;
  items?: CustodyItem[];
  /** the shipment's containers: a per-container item is price × this */
  shipmentContainers?: number;
  /** price-list items already on the shipment's other custodies (once per shipment) */
  usedSettlementItemIds?: number[];
  duplicateReceipts?: { receiptNo: string; custodyNo: string; fileNo: string }[];
}

export interface Fee {
  id: number;
  clearer: { id: number; fullName: string };
  shipment: { id: number; fileNo: string };
  custody: { id: number; custodyNo: string };
  base: string;
  extraRate: string;
  containersCount: number;
  amount: string;
  original: string;
  total: string;
  paid: string;
  remaining: string;
  adjustments: (Approval & { id: number; amount: string; reason: 'CONTAINERS_CHANGED' | 'CEO_OVERRIDE'; containersFrom: number | null; containersTo: number | null; notes: string | null; adjustmentDate: string })[];
  payments: (Approval & { id: number; amount: string; paymentDate: string; notes: string | null })[];
}

export interface FeePayment extends Approval {
  id: number;
  fee: { id: number; clearer: { id: number; fullName: string }; shipment: { id: number; fileNo: string } };
  amount: string;
  paymentDate: string;
  notes: string | null;
  account: { id: number; name: string; type: 'CASH' | 'BANK'; currency: Currency };
  beneficiary: { id: number; name: string; bankName: string; accountNumber: string } | null;
  transferRef: string | null;
}

export interface FeeAdjustment extends Approval {
  id: number;
  fee: { id: number; clearer: { id: number; fullName: string }; shipment: { id: number; fileNo: string } };
  amount: string;
  reason: 'CONTAINERS_CHANGED' | 'CEO_OVERRIDE';
  containersFrom: number | null;
  containersTo: number | null;
  notes: string | null;
  adjustmentDate: string;
}

export interface StatementLine {
  date: string;
  kind: string;
  description: string;
  reference: string;
  fileNo: string;
  debit: string;
  credit: string;
  balance: string;
  approvalStatus: ApprovalStatus | null;
}

export interface Statement {
  holder: { type: 'CLEARER' | 'AGENT' | 'WAY_OUT'; id: number | null; name: string };
  currency: Currency;
  lines: StatementLine[];
  totals: { debit: string; credit: string; balance: string };
}

/** A holder's totals: مدين = what they received, دائن = what they accounted for or earned. */
export interface HolderTotals {
  debit: string;
  credit: string;
  /** > 0: owes the office (مدين); < 0: the office owes them (مستحقات). */
  balance: string;
  movements: number;
  lastDate: string | null;
  openCustodies: number;
}

export interface Holders {
  clearers: ({ id: number; name: string } & HolderTotals)[];
  agents: ({ id: number; name: string } & HolderTotals)[];
  wayOut: HolderTotals | null;
}

export interface CustodiesQuery {
  search?: string;
  status?: 'OPEN' | 'SETTLED' | '';
  holderType?: HolderType | '';
  page: number;
}

export const custodyKeys = {
  list: (q: object) => ['finance', 'custodies', q] as const,
  one: (id: number) => ['finance', 'custody', id] as const,
  types: ['finance', 'shipment-expense-types'] as const,
  fees: (q: object) => ['finance', 'fees', q] as const,
  holders: ['finance', 'holders'] as const,
  statement: (kind: string, id: number | null) => ['finance', 'statement', kind, id] as const,
};

export const useCustodies = (q: CustodiesQuery) =>
  useQuery({
    queryKey: custodyKeys.list(q),
    queryFn: () => api.get<Page<Custody>>('/finance/custodies', { ...q, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export const useCustody = (id: number | null) =>
  useQuery({ queryKey: custodyKeys.one(id ?? 0), queryFn: () => api.get<Custody>(`/finance/custodies/${id}`), enabled: !!id });

export const useShipmentExpenseTypes = () =>
  useQuery({ queryKey: custodyKeys.types, queryFn: () => api.get<{ id: number; name: string }[]>('/finance/custodies/expense-types') });

export const useFees = (q: { clearerId?: number; shipmentId?: number }, enabled = true) =>
  useQuery({
    queryKey: custodyKeys.fees(q),
    queryFn: () => api.get<Page<Fee>>('/finance/clearer-fees', { ...q, pageSize: 100 }),
    enabled,
  });

export const useHolders = (enabled: boolean) =>
  useQuery({ queryKey: custodyKeys.holders, queryFn: () => api.get<Holders>('/finance/ledgers'), enabled });

/** kind: 'clearers' | 'agents' | 'way-out' | 'me' */
export const useStatement = (kind: string | null, id: number | null) =>
  useQuery({
    queryKey: custodyKeys.statement(kind ?? '', id),
    queryFn: () => api.get<Statement>(kind === 'way-out' || kind === 'me' ? `/finance/ledgers/${kind}` : `/finance/ledgers/${kind}/${id}`),
    enabled: !!kind,
  });

/** Shipments to pick from, searched on the server by file / bill / client. */
export const useShipmentSearch = (search: string) =>
  useQuery({
    queryKey: ['shipments', 'pick', search],
    queryFn: () =>
      api.get<Page<{ id: number; fileNo: string; client: { name: string }; commodity: string }>>('/shipments', { search, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

/** A settlement line: a price-list item (by id), or a manual one (type and amount). */
export type ItemInput = ({ settlementItemId: number } | { expenseType: string; amount: number }) & {
  receiptNo?: string;
  receiptKind?: ReceiptKind;
  description?: string;
};

export const custodyApi = {
  issue: (input: {
    shipmentId: number;
    holderType: HolderType;
    agentEmployeeId?: number;
    purpose?: Purpose;
    bankAccountId?: number;
    beneficiaryId?: number;
    transferRef?: string;
    amount: number;
    issueDate?: string;
    notes?: string;
  }) => api.post<Custody>('/finance/custodies', input),
  updateIssue: (id: number, input: { version: number; amount?: number; purpose?: Purpose; issueDate?: string; notes?: string | null }) =>
    api.patch<Custody>(`/finance/custodies/${id}`, input),
  settle: (id: number, input: { version: number; items: ItemInput[]; settlementDate?: string }) =>
    api.post<Custody>(`/finance/custodies/${id}/settlement`, input),
  payFee: (input: { feeId: number; amount: number; accountId?: number; beneficiaryId?: number; transferRef?: string; paymentDate?: string; notes?: string }) => api.post<FeePayment>('/finance/clearer-fees/payments', input),
  updateFeePayment: (id: number, input: { version: number; amount?: number; paymentDate?: string; notes?: string | null }) =>
    api.patch<FeePayment>(`/finance/clearer-fees/payments/${id}`, input),
  adjustFee: (input: { feeId: number; amount: number; notes: string }) => api.post<Fee>('/finance/clearer-fees/adjustments', input),
};

export type BeneficiaryKind = 'SHIPPING_AGENCY' | 'CLEARER' | 'OTHER';
export const BENEFICIARY_KINDS: Record<BeneficiaryKind, string> = {
  SHIPPING_AGENCY: 'توكيل ملاحي',
  CLEARER: 'مستخلص',
  OTHER: 'جهة تانية',
};

export interface Beneficiary {
  id: number;
  name: string;
  kind: BeneficiaryKind;
  clearer: { id: number; fullName: string } | null;
  bankName: string;
  accountNumber: string;
  isActive: boolean;
  notes: string | null;
}

export const useBeneficiaries = (q: { clearerId?: number; kind?: BeneficiaryKind }, enabled = true) =>
  useQuery({
    queryKey: ['finance', 'beneficiaries', q],
    queryFn: () => api.get<Beneficiary[]>('/finance/beneficiaries', { ...q, pageSize: 200 }),
    enabled,
  });

export const beneficiariesApi = {
  create: (input: { name: string; kind: BeneficiaryKind; clearerId?: number; bankName: string; accountNumber: string; notes?: string }) =>
    api.post<Beneficiary>('/finance/beneficiaries', input),
};
