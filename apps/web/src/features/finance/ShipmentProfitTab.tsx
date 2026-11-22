import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import { CURRENCIES, money, type Currency } from './api';

interface CurrencyProfit {
  currency: Currency;
  revenue: { statement: string; clearance: string; total: string };
  cost: { spent: string; openCustodies: string; bankCharges: string; clearerFee: string; total: string };
  expenseProfit: string;
  clearanceProfit: string;
  net: string;
  margin: number | null;
  custodies: string[];
  billed: string;
  collected: string;
  outstanding: string;
  empty: boolean;
}

interface ShipmentProfit {
  status: 'ESTIMATE' | 'FINAL';
  clearer: string | null;
  currencies: CurrencyProfit[];
  notes: string[];
}

const useShipmentProfit = (shipmentId: number) =>
  useQuery({
    queryKey: ['finance', 'shipment-profit', shipmentId],
    queryFn: () => api.get<ShipmentProfit>(`/finance/shipment-accounts/${shipmentId}/profit`),
  });

function Kpi({ label, value, hint, tone, strong }: { label: string; value: string; hint: React.ReactNode; tone?: string; strong?: boolean }) {
  return (
    <div className={`min-w-52 flex-1 rounded-xl border bg-surface-2/50 p-4 ${strong ? 'border-gold/40' : 'border-line'}`}>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold whitespace-nowrap ${tone ?? ''}`} dir="ltr" style={{ textAlign: 'right' }}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function Line({ label, sub, value, tone, bold }: { label: string; sub?: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <tr className="border-b border-line/60">
      <td className={`px-4 py-2.5 ${bold ? 'font-bold' : ''}`}>
        {label}
        {sub && <span className="text-xs text-muted"> · {sub}</span>}
      </td>
      <td className={`px-4 py-2.5 text-left font-semibold whitespace-nowrap ${tone ?? ''}`} dir="ltr">
        {value}
      </td>
    </tr>
  );
}

const Group = ({ title }: { title: string }) => (
  <tr>
    <td colSpan={2} className="bg-surface-2 px-4 py-2 text-sm font-bold text-muted">
      {title}
    </td>
  </tr>
);

/**
 * A shipment's profit: revenue (the client statement and the clearance invoice) against
 * cost (the custodies' spending and bank charges, and the clearer's fee). Shown to who
 * holds "finance.profit.view": the CEO, the accounts manager and financial relations.
 */
export function ShipmentProfitTab({ shipmentId }: { shipmentId: number }) {
  const { data, isLoading, error } = useShipmentProfit(shipmentId);
  const [picked, setPicked] = useState<Currency | null>(null);

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <div className="h-60 rounded-2xl shimmer" />;

  const shown = data.currencies.filter((c) => !c.empty);
  if (!shown.length) return <EmptyState compact text="لسه مفيش إيراد ولا تكلفة على الشحنة دي." />;
  const p = shown.find((c) => c.currency === picked) ?? shown[0];
  const cur = p.currency;
  const minus = (v: string) => (Number(v) ? `− ${money(v)}` : money(v));
  const signed = (v: string) => (Number(v) < 0 ? 'text-danger' : 'text-success');
  const paidShare = Number(p.billed) > 0 ? Math.min(100, (Number(p.collected) / Number(p.billed)) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {data.status === 'FINAL' ? (
          <Badge tone="success">نهائي · من الفواتير</Badge>
        ) : (
          <>
            <Badge tone="gold">تقديري · الحساب لسه مفتوح</Badge>
            <span className="text-sm text-muted">بيبقى نهائي بعد «إنهاء الحساب» وإصدار الفواتير</span>
          </>
        )}
        {shown.length > 1 && (
          <div className="ms-auto flex gap-1 rounded-full bg-surface-2 p-1">
            {shown.map((c) => (
              <button
                key={c.currency}
                type="button"
                onClick={() => setPicked(c.currency)}
                className={`focus-ring rounded-full px-4 py-1.5 text-sm ${c.currency === cur ? 'gold-fill font-semibold' : 'text-muted'}`}
              >
                {CURRENCIES[c.currency].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Kpi label="الإيراد" value={money(p.revenue.total, cur)} hint="كشف الحساب + فاتورة التخليص (من غير الضريبة)" />
        <Kpi label="التكلفة" value={money(p.cost.total, cur)} tone="text-danger" hint="المصروف الفعلي + المصاريف البنكية + أتعاب المستخلص" />
        <Kpi
          label="صافي الربح"
          value={money(p.net, cur)}
          tone={Number(p.net) < 0 ? 'text-danger' : 'text-gold'}
          strong
          hint={p.margin === null ? '—' : <Badge tone={p.margin < 0 ? 'danger' : 'success'}>{`هامش ${p.margin}%`}</Badge>}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="min-w-0 flex-[2_1_480px] overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-4 py-2.5 text-start font-medium">البند</th>
                <th className="px-4 py-2.5 text-left font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              <Group title="المصاريف (كشف حساب العميل)" />
              <Line label="كشف حساب العميل" value={money(p.revenue.statement)} />
              <Line label="المصروف الفعلي من العهد" sub={p.custodies.join('، ') || undefined} value={minus(p.cost.spent)} tone="text-danger" />
              {Number(p.cost.bankCharges) > 0 && <Line label="مصاريف بنكية" value={minus(p.cost.bankCharges)} tone="text-danger" />}
              <Line label="ربح المصاريف" value={money(p.expenseProfit)} tone={signed(p.expenseProfit)} bold />

              {(Number(p.revenue.clearance) > 0 || Number(p.cost.clearerFee) > 0) && (
                <>
                  <Group title="التخليص" />
                  <Line label="فاتورة التخليص" value={money(p.revenue.clearance)} />
                  <Line label="أتعاب المستخلص" sub={data.clearer ?? undefined} value={minus(p.cost.clearerFee)} tone="text-danger" />
                  <Line label="ربح التخليص" value={money(p.clearanceProfit)} tone={signed(p.clearanceProfit)} bold />
                </>
              )}
              <tr className="bg-gold/5">
                <td className="px-4 py-3 text-base font-bold">صافي الربح</td>
                <td className={`px-4 py-3 text-left text-base font-bold whitespace-nowrap ${Number(p.net) < 0 ? 'text-danger' : 'text-gold'}`} dir="ltr">
                  {money(p.net, cur)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <aside className="flex-[1_1_260px] space-y-4">
          <section className="space-y-2.5 rounded-xl border border-line p-4 text-sm">
            <h3 className="font-bold">التحصيل</h3>
            {Number(p.billed) > 0 ? (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="gold-fill h-full rounded-full" style={{ width: `${paidShare}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">اتحصّل</span>
                  <b dir="ltr">{money(p.collected, cur)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">باقي على العميل</span>
                  <b dir="ltr" className={Number(p.outstanding) > 0 ? 'text-danger' : 'text-success'}>
                    {money(p.outstanding, cur)}
                  </b>
                </div>
                <p className="text-xs text-muted">الربح بيتحقق فعلاً لما العميل يدفع كل اللي عليه.</p>
              </>
            ) : (
              <p className="text-muted">لسه مفيش فواتير اتصدرت للعميل.</p>
            )}
          </section>
          {data.notes.length > 0 && (
            <section className="space-y-1.5 rounded-xl border border-line p-4 text-sm">
              <h3 className="font-bold">ملاحظات</h3>
              {data.notes.map((n) => (
                <p key={n} className="text-muted">
                  • {n}
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
