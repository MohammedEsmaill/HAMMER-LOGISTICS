import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { formatDate } from '@/lib/format';
import { money } from './api';
import { useBalanceSheet, useIncomeStatement, useVatReport, type GlPeriod, type StatementSection } from './gl-api';

const Loading = () => <Spinner className="mx-auto my-10 size-7 text-gold" />;

/** One block of a statement: its accounts, indented under their groups, then its total. */
function Block({ title, section, totalLabel }: { title: string; section: StatementSection; totalLabel: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-gold/10 px-4 py-2.5 font-extrabold">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {section.lines.map((l) => (
            <tr key={l.key} className={`border-t border-line ${l.group ? 'bg-surface-2 font-bold' : ''}`}>
              <td className="w-16 px-4 py-2 tabular-nums text-muted" dir="ltr" style={{ textAlign: 'right' }}>
                {l.code}
              </td>
              <td className="py-2" style={{ paddingInlineStart: `${l.level * 1.1}rem` }}>
                {l.name}
              </td>
              <td className={`px-4 py-2 text-end tabular-nums ${Number(l.amount) < 0 ? 'text-danger' : ''}`}>{money(l.amount)}</td>
            </tr>
          ))}
          {section.lines.length === 0 && (
            <tr className="border-t border-line">
              <td colSpan={3} className="px-4 py-4 text-center text-muted">
                مفيش أرصدة
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gold/50 font-extrabold">
            <td colSpan={2} className="px-4 py-2.5">
              {totalLabel}
            </td>
            <td className="px-4 py-2.5 text-end tabular-nums">{money(section.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Banner({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={`card flex items-center gap-2 p-3 text-sm ${ok ? 'text-success' : 'text-danger'}`}>
      {ok ? <CheckCircle2 className="size-5" /> : <TriangleAlert className="size-5" />}
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

/** Revenues less expenses within the period. */
export function IncomeStatementView({ period }: { period: GlPeriod }) {
  const { data, error } = useIncomeStatement(period);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const net = Number(data.net);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="الإيرادات" value={money(data.revenues.total, period.currency)} />
        <Stat label="المصروفات" value={money(data.expenses.total, period.currency)} />
        <Stat
          label={net >= 0 ? `صافي الربح${net > 0 && data.margin ? ` · ${data.margin}% من الإيرادات` : ''}` : 'صافي الخسارة'}
          value={money(Math.abs(net), period.currency)}
          tone={net >= 0 ? 'text-success' : 'text-danger'}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="الإيرادات" section={data.revenues} totalLabel="إجمالي الإيرادات" />
        <Block title="المصروفات" section={data.expenses} totalLabel="إجمالي المصروفات" />
      </div>
      <p className="text-xs text-muted">
        الإيرادات: إيراد التخليص من غير الضريبة، وفرق مصاريف الشحنات (الزيادة اللي على العميل فوق المصروف الفعلي). المصاريف المدفوعة لحساب العملاء مش مصروف
        علينا، فمش داخلة هنا.
      </p>
    </div>
  );
}

/** What the company holds and owes at a date. */
export function BalanceSheetView({ period }: { period: GlPeriod }) {
  const { data, error } = useBalanceSheet(period);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-3">
      <Banner ok={data.balanced}>
        {data.balanced
          ? `الميزانية متزنة: الأصول = الالتزامات + حقوق الملكية = ${money(data.assets.total, period.currency)}`
          : `الميزانية مش متزنة: الأصول ${money(data.assets.total)} والالتزامات وحقوق الملكية ${money(data.totalLiabilitiesAndEquity)}`}
      </Banner>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Block title="الأصول" section={data.assets} totalLabel="إجمالي الأصول" />
        <div className="space-y-3">
          <Block title="الالتزامات" section={data.liabilities} totalLabel="إجمالي الالتزامات" />
          <Block title="حقوق الملكية" section={data.equity} totalLabel="إجمالي حقوق الملكية" />
          <div className="card flex justify-between px-4 py-3 font-extrabold">
            <span>الالتزامات + حقوق الملكية</span>
            <span className="tabular-nums">{money(data.totalLiabilitiesAndEquity)}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">
        الميزانية في التاريخ المختار في خانة «إلى» (لو فاضية: لحد النهاردة). لحد ما نعمل قفل الشهور، صافي الأرباح من أول التشغيل بيظهر سطر واحد في حقوق الملكية.
        الرقم الأحمر رصيد عكس طبيعة الحساب.
      </p>
    </div>
  );
}

/** The VAT on the invoices issued in the period, by rate. */
export function VatView({ period }: { period: GlPeriod }) {
  const { data, error } = useVatReport(period);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="عدد الفواتير" value={String(data.totals.count)} />
        <Stat label="قيمة الفواتير قبل الضريبة" value={money(data.totals.subtotal, period.currency)} />
        <Stat label="الضريبة المستحقة" value={money(data.totals.vat, period.currency)} tone="text-gold" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 text-start">النسبة</th>
              <th className="px-3 py-2 text-end">عدد الفواتير</th>
              <th className="px-3 py-2 text-end">قبل الضريبة</th>
              <th className="px-3 py-2 text-end">الضريبة</th>
              <th className="px-3 py-2 text-end">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {data.rates.map((r) => (
              <tr key={r.rate} className="border-t border-line">
                <td className="px-3 py-2 font-bold">{Number(r.rate)}%</td>
                <td className="px-3 py-2 text-end tabular-nums">{r.count}</td>
                <td className="px-3 py-2 text-end tabular-nums">{money(r.subtotal)}</td>
                <td className="px-3 py-2 text-end font-bold tabular-nums text-gold">{money(r.vat)}</td>
                <td className="px-3 py-2 text-end tabular-nums">{money(r.total)}</td>
              </tr>
            ))}
            {data.rates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  مفيش فواتير في الفترة دي
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.invoices.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="px-4 py-2.5 font-bold">الفواتير</div>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-2 text-start">التاريخ</th>
                <th className="px-3 py-2 text-start">رقم الفاتورة</th>
                <th className="px-3 py-2 text-start">العميل</th>
                <th className="px-3 py-2 text-start">الملف</th>
                <th className="px-3 py-2 text-end">النسبة</th>
                <th className="px-3 py-2 text-end">قبل الضريبة</th>
                <th className="px-3 py-2 text-end">الضريبة</th>
                <th className="px-3 py-2 text-end">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(i.date)}</td>
                  <td className="px-3 py-2" dir="ltr" style={{ textAlign: 'right' }}>
                    {i.invoiceNo}
                  </td>
                  <td className="px-3 py-2">{i.client}</td>
                  <td className="px-3 py-2" dir="ltr" style={{ textAlign: 'right' }}>
                    <Link to={`/shipment-accounts/${i.shipmentId}`} className="text-gold hover:underline">
                      {i.fileNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-end">{Number(i.rate)}%</td>
                  <td className="px-3 py-2 text-end tabular-nums">{money(i.subtotal)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{money(i.vat)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{money(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        ضريبة المبيعات على فواتير التخليص (وبعدين فواتير النقل) اللي اتصدرت في الفترة، والملغية مش داخلة. ضريبة المشتريات مش متسجلة في السيستم، فالرقم ده هو
        الضريبة المستحقة قبل خصمها.
      </p>
    </div>
  );
}
