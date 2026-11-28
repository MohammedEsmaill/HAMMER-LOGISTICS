import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { financeKeys, type Approval, type BankPaid, type BankPaymentMethod, type Currency, type DateRange, type Direction } from './api';

export type PartyKind = 'SISTER_COMPANY' | 'OWNER';
export type PartyMovementKind = 'FUNDING' | 'PAYMENT' | 'SHARED_DEBT';

export const PARTY_KINDS: Record<PartyKind, string> = {
  SISTER_COMPANY: 'شركة شقيقة',
  OWNER: 'مالك',
};

export const PARTY_MOVEMENT_KINDS: Record<PartyMovementKind, { label: string; hint: string }> = {
  FUNDING: { label: 'تغذية', hint: 'فلوس جاية من الجهة لخزنة أو بنك عندنا' },
  PAYMENT: { label: 'صرف', hint: 'فلوس طالعة منّا للجهة' },
  SHARED_DEBT: { label: 'سداد مديونيات مشتركة', hint: 'مديونية اتدفعت عن الجهة، مش مصروف على الشركة' },
};

/** Positive: the party owes us (مدين). Negative: we owe the party (دائن). */
export interface PartyBalance {
  currency: Currency;
  balance: string;
  in: string;
  out: string;
}

export interface Party {
  id: number;
  name: string;
  kind: PartyKind;
  notes: string | null;
  isActive: boolean;
  balances: PartyBalance[];
  personalAccounts: { id: number; name: string; bankName: string | null; currency: Currency }[];
  _count: { movements: number };
}

interface AccountRef {
  id: number;
  name: string;
  type: 'CASH' | 'BANK';
  currency: Currency;
  ownership: 'COMPANY' | 'PERSONAL';
}

export interface PartyMovement extends Approval, BankPaid {
  id: number;
  party: { id: number; name: string; kind: PartyKind };
  account: AccountRef;
  currency: Currency;
  kind: PartyMovementKind;
  direction: Direction;
  amount: string;
  movementDate: string;
  payee: string | null;
  reference: string | null;
  notes: string | null;
}

export interface StatementLine extends Omit<PartyMovement, 'party'> {
  balance: string;
}

export interface PartyStatement {
  party: Omit<Party, 'balances' | 'personalAccounts' | '_count'>;
  opening: PartyBalance[];
  lines: StatementLine[];
  closing: PartyBalance[];
}

export interface PartyMovementInput {
  partyId: number;
  accountId: number;
  kind: PartyMovementKind;
  amount: number;
  movementDate?: string;
  payee?: string;
  /** PAYMENT: the party's own bank account */
  beneficiaryId?: number;
  reference?: string;
  notes?: string;
  paymentMethod?: BankPaymentMethod;
  bankCharges?: number;
}

export const partyKeys = {
  all: [...financeKeys.all, 'parties'] as const,
  options: [...financeKeys.all, 'parties', 'options'] as const,
  statement: (id: number, q: DateRange) => [...financeKeys.all, 'parties', id, q] as const,
};

export const useParties = () => useQuery({ queryKey: partyKeys.all, queryFn: () => api.get<Party[]>('/finance/parties') });

export const usePartyOptions = (enabled = true) =>
  useQuery({
    queryKey: partyKeys.options,
    queryFn: () => api.get<{ id: number; name: string; kind: PartyKind }[]>('/finance/parties/options'),
    enabled,
  });

export const usePartyStatement = (id: number | null, q: DateRange) =>
  useQuery({
    queryKey: partyKeys.statement(id ?? 0, q),
    queryFn: () => api.get<PartyStatement>(`/finance/parties/${id}/statement`, { ...q }),
    enabled: !!id,
  });

export const partiesApi = {
  create: (input: { name: string; kind: PartyKind; notes?: string }) => api.post<Party>('/finance/parties', input),
  update: (id: number, input: { name?: string; notes?: string | null; isActive?: boolean }) =>
    api.patch<Party>(`/finance/parties/${id}`, input),
  createMovement: (input: PartyMovementInput) => api.post<PartyMovement>('/finance/party-movements', input),
  updateMovement: (
    id: number,
    input: {
      version: number;
      accountId?: number;
      amount?: number;
      movementDate?: string;
      payee?: string;
      reference?: string | null;
      notes?: string | null;
      paymentMethod?: BankPaymentMethod;
      bankCharges?: number;
    },
  ) => api.patch<PartyMovement>(`/finance/party-movements/${id}`, input),
};

/** "دائن / مدين" for a balance: positive = they owe us. */
export function balanceSide(balance: string | number): { label: string; tone: 'danger' | 'success' | 'muted' } {
  const n = Number(balance);
  if (n > 0) return { label: 'مدين (عليه)', tone: 'danger' };
  if (n < 0) return { label: 'دائن (ليه)', tone: 'success' };
  return { label: 'متصفّي', tone: 'muted' };
}
