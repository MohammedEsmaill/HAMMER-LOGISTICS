import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Page } from '@/lib/mutations';
import type { Approval, ApprovalStatus, Currency } from './api';

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: 'muted' | 'gold' | 'success' }> = {
  UNPAID: { label: 'مش مدفوعة', tone: 'muted' },
  PARTIAL: { label: 'مدفوعة جزئيًا', tone: 'gold' },
  PAID: { label: 'متسددة', tone: 'success' },
};

export interface InvoiceLine {
  id: number;
  lineNo: number;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  custodyItemId: number | null;
}

export interface Invoice extends Approval {
  id: number;
  shipmentId: number;
  type: 'STATEMENT' | 'CLEARANCE';
  currency: Currency;
  invoiceNo: string;
  cycle: number;
  invoiceDate: string;
  valueDate: string | null;
  customerRef: string | null;
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  wht: string;
  total: string;
  notes: string | null;
  voidedAt: string | null;
  voidedBy: { id: number; email: string } | null;
  lines: InvoiceLine[];
}

export interface PrintHeader {
  id: number;
  fileNo: string;
  direction: 'IMPORT' | 'EXPORT';
  client: { id: number; name: string };
  hblNumber: string | null;
  mblNumber: string | null;
  pod: string | null;
  pol: string | null;
  containerNumbers: string[];
  containers: { HQ40: number; HQ20: number; LCL: number };
  vessel: string | null;
  commodity: string;
  consignee: string;
  certificateNo: string | null;
  releaseDate: string | null;
  weight: string;
}

export interface DraftLine {
  source: 'ITEM' | 'EXTRA';
  id: number;
  description: string;
  defaultDescription?: string;
  amount: string;
  actualAmount?: string;
  excluded: boolean;
  overridden: boolean;
  custodyNo?: string;
  expenseType?: string;
}

export interface Collection extends Approval {
  id: number;
  currency: Currency;
  amount: string;
  method: 'CASH' | 'TRANSFER';
  collectionDate: string;
  reference: string | null;
  notes: string | null;
  account: { id: number; name: string; type: 'CASH' | 'BANK' };
  client?: { id: number; name: string };
  shipment?: { id: number; fileNo: string };
}

export interface ShipmentAccountView {
  shipment: PrintHeader & { mode: string };
  account: { status: 'OPEN' | 'FINISHED'; paymentStatus: PaymentStatus; version: number; reopenCount: number; finishedAt: string | null };
  custodies: { id: number; custodyNo: string; status: 'OPEN' | 'SETTLED'; currency: Currency; amount: string; spentAmount: string; holderType: string; approvalStatus: ApprovalStatus }[];
  openCustodies: string[];
  draft: Record<Currency, { lines: DraftLine[]; total: string; actualTotal: string }>;
  clearanceQuote: { base: string; extra: string; containers: number; amount: string };
  invoices: Invoice[];
  collections: Collection[];
  clearerFee: { id: number; amount: string; clearer: { fullName: string } } | null;
  totals: { currency: Currency; actual: string; statement: string; billed: string; collected: string; outstanding: string }[];
}

export interface AccountRow {
  id: number;
  fileNo: string;
  direction: string;
  mode: string;
  certificateNo: string | null;
  client: { id: number; name: string };
  status: 'OPEN' | 'FINISHED';
  paymentStatus: PaymentStatus;
  openCustodies: number;
  invoices: { type: string; currency: Currency; total: string; invoiceNo: string; approvalStatus: ApprovalStatus }[];
  totals: { currency: Currency; actual: string; billed: string; collected: string }[];
}

export interface CompanySettings {
  name: string;
  address: string;
  taxNumber: string;
  crNumber: string;
  emails: string[];
}

export interface ClientLedger {
  client: { id: number; name: string };
  currencies: {
    currency: Currency;
    lines: { date: string; kind: string; description: string; fileNo: string; debit: string; credit: string; balance: string; approvalStatus: ApprovalStatus }[];
    totals: { debit: string; credit: string; balance: string };
  }[];
}

export interface ClientBalance {
  client: { id: number; name: string };
  currencies: Partial<Record<Currency, { billed: string; collected: string; balance: string }>>;
}

export const accountKeys = {
  list: (q: object) => ['finance', 'shipment-accounts', q] as const,
  one: (id: number) => ['finance', 'shipment-account', id] as const,
  invoice: (id: number) => ['finance', 'invoice', id] as const,
  company: ['settings', 'company'] as const,
  balances: ['finance', 'client-balances'] as const,
  ledger: (id: number) => ['finance', 'client-ledger', id] as const,
};

export const useShipmentAccounts = (q: { search?: string; status?: string; paymentStatus?: string; page: number }) =>
  useQuery({
    queryKey: accountKeys.list(q),
    queryFn: () => api.get<Page<AccountRow>>('/finance/shipment-accounts', { ...q, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export const useShipmentAccount = (id: number) =>
  useQuery({ queryKey: accountKeys.one(id), queryFn: () => api.get<ShipmentAccountView>(`/finance/shipment-accounts/${id}`) });

export const useInvoice = (id: number | null) =>
  useQuery({
    queryKey: accountKeys.invoice(id ?? 0),
    queryFn: () => api.get<Invoice & { shipment: PrintHeader }>(`/finance/invoices/${id}`),
    enabled: !!id,
  });

export const useCompany = () =>
  useQuery({ queryKey: accountKeys.company, queryFn: () => api.get<CompanySettings>('/settings/company'), staleTime: 10 * 60_000 });

export const useClientBalances = () =>
  useQuery({ queryKey: accountKeys.balances, queryFn: () => api.get<ClientBalance[]>('/finance/clients/balances') });

export const useClientLedger = (id: number | null) =>
  useQuery({ queryKey: accountKeys.ledger(id ?? 0), queryFn: () => api.get<ClientLedger>(`/finance/clients/${id}/ledger`), enabled: !!id });

export const accountApi = {
  override: (itemId: number, input: { excluded?: boolean; description?: string | null; amount?: number | null }) =>
    api.patch<ShipmentAccountView>(`/finance/shipment-accounts/items/${itemId}`, input),
  addExtra: (shipmentId: number, input: { currency: Currency; description: string; amount: number }) =>
    api.post<ShipmentAccountView>(`/finance/shipment-accounts/${shipmentId}/extra-lines`, input),
  removeExtra: (id: number) => api.delete<ShipmentAccountView>(`/finance/shipment-accounts/extra-lines/${id}`),
  finish: (
    shipmentId: number,
    input: {
      version: number;
      clearanceLines?: { description: string; quantity: number; unitPrice: number }[];
      invoiceDate?: string;
      valueDate?: string;
      customerRef?: string;
      confirmNoCertificate?: boolean;
    },
  ) => api.post<ShipmentAccountView>(`/finance/shipment-accounts/${shipmentId}/finish`, input),
  reopen: (shipmentId: number, input: { version: number; reason: string }) =>
    api.post<ShipmentAccountView>(`/finance/shipment-accounts/${shipmentId}/reopen`, input),
  collect: (input: {
    shipmentId: number;
    currency: Currency;
    amount: number;
    method: 'CASH' | 'TRANSFER';
    bankAccountId?: number;
    collectionDate?: string;
    reference?: string;
    notes?: string;
  }) => api.post<Collection>('/finance/collections', input),
  updateCollection: (id: number, input: { version: number; amount?: number; collectionDate?: string; reference?: string | null; notes?: string | null }) =>
    api.patch<Collection>(`/finance/collections/${id}`, input),
  updateCompany: (input: Partial<CompanySettings>) => api.patch<CompanySettings>('/settings/company', input),
};
