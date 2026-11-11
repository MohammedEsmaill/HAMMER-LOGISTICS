import { Landmark, Pencil, Plus, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { AccountDrawer } from './AccountDrawers';
import { CURRENCIES, money, useAccounts, type Currency, type MoneyAccount } from './api';

function AccountCard({ account, onOpen, onEdit, index }: { account: MoneyAccount; onOpen: () => void; onEdit?: () => void; index: number }) {
  const Icon = account.type === 'CASH' ? Wallet : Landmark;
  return (
    <motion.div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      className={`card focus-ring relative cursor-pointer space-y-3 overflow-hidden p-4 ${account.isActive ? '' : 'opacity-60'}`}
    >
      {account.type === 'CASH' && <div className="pointer-events-none absolute -top-10 -left-10 size-32 rounded-full bg-gold/10 blur-2xl" />}
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${account.type === 'CASH' ? 'gold-fill' : 'bg-gold/10 text-gold'}`}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{account.name}</div>
          <div className="truncate text-xs text-muted" dir={account.accountNumber ? 'ltr' : undefined} style={{ textAlign: 'right' }}>
            {account.type === 'CASH' ? 'خزنة' : `${account.bankName} · ${account.accountNumber}`}
          </div>
        </div>
        {!account.isActive && <Badge tone="muted">موقوف</Badge>}
        {onEdit && (
          <IconButton label={`تعديل ${account.name}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </IconButton>
        )}
      </div>
      <div className="text-2xl font-bold tracking-tight" dir="ltr" style={{ textAlign: 'right' }}>
        {money(account.balance, account.currency)}
      </div>
    </motion.div>
  );
}

/**
 * Every cash box and bank account with its balance, by currency. A card opens the
 * account's page; only the CEO adds or edits accounts. Money is recorded in the journal.
 */
export default function TreasuryPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: accounts = [], isLoading, error } = useAccounts();
  const [editing, setEditing] = useState<MoneyAccount | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const manage = can('finance.accounts.manage');

  const byCurrency = (['EGP', 'USD'] as Currency[]).map((c) => {
    const list = accounts.filter((a) => a.currency === c);
    const total = list.reduce((s, a) => s + Number(a.balance), 0);
    return { currency: c, list, total };
  });

  return (
    <>
      <PageHeader
        title="الخزن والحسابات البنكية"
        actions={
          manage && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setAccountOpen(true);
              }}
            >
              حساب بنكي
            </Button>
          )
        }
      />
      {error ? <ErrorBox error={error} /> : null}
      {isLoading && <div className="h-40 rounded-2xl shimmer" />}

      <div className="space-y-6">
        {byCurrency.map(({ currency, list, total }) => (
          <section key={currency} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">{CURRENCIES[currency].label}</h2>
              <span className="text-sm text-muted">
                الإجمالي:{' '}
                <b className="text-gold" dir="ltr">
                  {money(total, currency)}
                </b>
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((a, i) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  index={i}
                  onOpen={() => navigate(`/treasury/${a.id}`)}
                  onEdit={
                    manage
                      ? () => {
                          setEditing(a);
                          setAccountOpen(true);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <AccountDrawer account={editing} open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  );
}
