import { useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, PageHeader } from '@/components/ui/misc';
import { formatDate } from '@/lib/format';
import { useClientBalances, useClientLedger } from './account-api';
import { CURRENCIES, money, STATUS } from './api';

function LedgerDrawer({ clientId, onClose }: { clientId: number | null; onClose: () => void }) {
  const { data, error } = useClientLedger(clientId);
  return (
    <Drawer open={!!clientId} onClose={onClose} width="max-w-4xl" title={data ? `كشف حساب ${data.client.name}` : 'كشف حساب العميل'}>
      {error ? <ErrorBox error={error} /> : null}
      {!data && !error && <div className="h-40 rounded-2xl shimmer" />}
      {data && (
        <div className="space-y-8">
          {data.currencies
            .filter((c) => c.lines.length)
            .map((c) => (
              <section key={c.currency} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-gold">بال{CURRENCIES[c.currency].label}</h3>
                  <span className="text-sm">
                    عليه <b dir="ltr" className={Number(c.totals.balance) > 0 ? 'text-warning' : 'text-success'}>{money(c.totals.balance, c.currency)}</b>
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-muted">
                      <tr>
                        {['التاريخ', 'البيان', 'الملف', 'مدين', 'دائن', 'الرصيد'].map((h) => (
                          <th key={h} className="px-3 py-2 text-start font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.lines.map((l, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                          <td className="px-3 py-2">
                            <span dir="ltr">{l.description}</span> <Badge tone={STATUS[l.approvalStatus].tone}>{STATUS[l.approvalStatus].label}</Badge>
                          </td>
                          <td className="px-3 py-2" dir="ltr">
                            {l.fileNo}
                          </td>
                          <td className="px-3 py-2" dir="ltr">
                            {Number(l.debit) ? money(l.debit) : ''}
                          </td>
                          <td className="px-3 py-2 text-success" dir="ltr">
                            {Number(l.credit) ? money(l.credit) : ''}
                          </td>
                          <td className="px-3 py-2 font-bold" dir="ltr">
                            {money(l.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          {data.currencies.every((c) => !c.lines.length) && <p className="text-muted">مفيش فواتير ولا تحصيل.</p>}
        </div>
      )}
    </Drawer>
  );
}

export default function ClientLedgersPage() {
  const { data, error } = useClientBalances();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PageHeader title="حسابات العملاء" description="كل عميل ليه رصيدين: جنيه ودولار. مدين = الفواتير، دائن = التحصيل." />
      {error ? <ErrorBox error={error} /> : null}
      {!data && !error && <div className="h-40 rounded-2xl shimmer" />}
      {data?.length === 0 && <p className="py-6 text-center text-muted">مفيش فواتير لسه.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((b) => (
          <button key={b.client.id} type="button" onClick={() => setOpen(b.client.id)} className="card focus-ring space-y-2 p-4 text-start hover:border-gold/60">
            <div className="font-bold">{b.client.name}</div>
            {(['EGP', 'USD'] as const)
              .filter((c) => b.currencies[c])
              .map((c) => (
                <div key={c} className="flex justify-between text-sm">
                  <span className="text-muted">{CURRENCIES[c].label}</span>
                  <b dir="ltr" className={Number(b.currencies[c]!.balance) > 0 ? 'text-warning' : 'text-success'}>
                    {money(b.currencies[c]!.balance, c)}
                  </b>
                </div>
              ))}
          </button>
        ))}
      </div>
      <LedgerDrawer clientId={open} onClose={() => setOpen(null)} />
    </>
  );
}
