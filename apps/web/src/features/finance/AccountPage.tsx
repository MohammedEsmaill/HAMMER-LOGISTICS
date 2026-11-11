import { ArrowRight, Landmark, Pencil, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { formatDate } from '@/lib/format';
import { AccountDrawer, AccountStatement, lineDocument } from './AccountDrawers';
import { CURRENCIES, money, useAccounts } from './api';
import { DocumentDrawers, type OpenDocument } from './DocumentDrawers';

function Info({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-semibold" dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>
        {value}
      </div>
    </div>
  );
}

/** One cash box or bank account: its data (the CEO edits it) and its statement. */
export default function AccountPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const { data: accounts, isLoading, error } = useAccounts();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<OpenDocument | null>(null);
  const account = accounts?.find((a) => a.id === id);
  const manage = can('finance.accounts.manage');

  if (error) return <ErrorBox error={error} />;
  if (isLoading) return <div className="h-60 rounded-2xl shimmer" />;
  if (!account) {
    return (
      <div className="card p-8 text-center text-muted">
        الحساب ده مش موجود.{' '}
        <Link to="/treasury" className="text-gold">
          ارجع للخزن والحسابات
        </Link>
      </div>
    );
  }
  const Icon = account.type === 'CASH' ? Wallet : Landmark;

  return (
    <div className="space-y-6">
      <Link to="/treasury" className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowRight className="size-4" /> الخزن والحسابات البنكية
      </Link>

      <section className="card space-y-5 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className={`grid size-12 place-items-center rounded-2xl ${account.type === 'CASH' ? 'gold-fill' : 'bg-gold/10 text-gold'}`}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{account.name}</h2>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge tone="muted">{account.type === 'CASH' ? 'خزنة' : 'حساب بنكي'}</Badge>
              <Badge tone={account.isActive ? 'success' : 'muted'}>{account.isActive ? 'شغال' : 'موقوف'}</Badge>
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs text-muted">الرصيد الحالي</div>
            <div className="text-3xl font-bold text-gold" dir="ltr">
              {money(account.balance, account.currency)}
            </div>
          </div>
          {manage && (
            <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              تعديل
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="العملة" value={CURRENCIES[account.currency].label} />
          {account.type === 'BANK' && <Info label="البنك" value={account.bankName} />}
          {account.type === 'BANK' && <Info label="رقم الحساب / IBAN" value={account.accountNumber} ltr />}
          <Info label="الرصيد الافتتاحي" value={money(account.openingBalance, account.currency)} ltr />
          <Info label="تاريخ الإضافة" value={formatDate(account.createdAt)} />
        </div>
        {!manage && <p className="text-xs text-muted">بيانات الحساب بيعدّلها الـ CEO بس.</p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold">كشف الحركة</h3>
        <AccountStatement account={account} onOpenLine={(l) => setOpen(lineDocument(l))} />
      </section>

      <AccountDrawer account={account} open={editing} onClose={() => setEditing(false)} />
      <DocumentDrawers open={open} onClose={() => setOpen(null)} />
    </div>
  );
}
