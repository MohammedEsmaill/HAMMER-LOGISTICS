import { useAuth } from '@/auth/auth-context';
import type { Permission } from '@/auth/permissions';
import { money, type Approval, type MoneyAccount } from './api';

/** Who may change this document now (the API enforces the same rule). */
export function useEditable(doc: Approval | null, recordPermission: Permission = 'finance.movements.create') {
  const { can, user } = useAuth();
  if (!doc) return can(recordPermission);
  if (doc.approvalStatus === 'APPROVED') return can('finance.approved.edit');
  return doc.createdBy.id === user?.id || can('finance.approved.edit');
}

export const accountOptions = (accounts: MoneyAccount[], keep?: number) =>
  accounts
    .filter((a) => a.isActive || a.id === keep)
    .map((a) => ({
      value: a.id,
      // a personal account is a payment channel: its owner, not a balance
      label: a.ownership === 'PERSONAL' ? `${a.name} · شخصي (${a.ownerParty?.name ?? ''}) · ${a.currency}` : `${a.name} · ${money(a.balance, a.currency)}`,
    }));

