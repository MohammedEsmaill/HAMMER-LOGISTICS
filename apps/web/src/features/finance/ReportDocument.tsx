import type { ReactNode } from 'react';
import type { CompanySettings } from './account-api';
import { CURRENCIES, money, STATUS, type Currency } from './api';
import { JOURNAL_TYPES, type JournalRow, type JournalTotals } from './journal-api';
import { REPORT_KINDS, type AccountsReport, type ExpensesReport, type JournalReport, type Report } from './report-api';

const INK = '#141414';
const GOLD = '#a8791f';
const GOLD_SOFT = '#f6efdc';
const LINE = '#d9d2c3';

const day = (d: string) => new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const stamp = (d: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const num = (v: string | number) => money(v);

function SectionTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="mt-7 mb-3 flex items-center gap-2 text-[15px] font-bold" style={{ color: INK }}>
      <span className="grid size-6 place-items-center rounded-full text-xs text-white" style={{ background: GOLD }}>
        {n}
      </span>
      {children}
      <span className="h-px flex-1" style={{ background: LINE }} />
    </h2>
  );
}

function Table({ head, children, foot }: { head: ReactNode[]; children: ReactNode; foot?: ReactNode }) {
  return (
    <table className="w-full border-collapse text-[11.5px]" style={{ color: INK }}>
      <thead>
        <tr style={{ background: INK, color: '#f1d27a' }}>
          {head.map((h, i) => (
            <th key={i} className="border px-2 py-1.5 text-start font-bold whitespace-nowrap" style={{ borderColor: INK }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
      {foot && <tfoot>{foot}</tfoot>}
    </table>
  );
}

function Td({ children, ltr, strong, tone, className = '' }: { children?: ReactNode; ltr?: boolean; strong?: boolean; tone?: 'in' | 'out'; className?: string }) {
  return (
    <td
      className={`border px-2 py-1 align-top ${strong ? 'font-bold' : ''} ${className}`}
      dir={ltr ? 'ltr' : undefined}
      style={{ borderColor: LINE, textAlign: ltr ? 'right' : undefined, color: tone === 'in' ? '#15803d' : tone === 'out' ? '#b91c1c' : undefined }}
    >
      {children}
    </td>
  );
}

function TotalRow({ cells }: { cells: ReactNode[] }) {
  return <tr style={{ background: GOLD_SOFT }}>{cells}</tr>;
}

function Kpis({ totals }: { totals: JournalTotals[] }) {
  if (!totals.length) return <p className="text-sm">مفيش معاملات في الفترة دي.</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {totals.map((t) => (
        <div key={t.currency} className="rounded-lg border p-3" style={{ borderColor: LINE }}>
          <div className="mb-2 text-xs font-bold" style={{ color: GOLD }}>
            {CURRENCIES[t.currency].label}
          </div>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            {[
              ['وارد', money(t.in, t.currency), '#15803d'],
              ['منصرف', money(t.out, t.currency), '#b91c1c'],
              ['الصافي', money(Number(t.in) - Number(t.out), t.currency), INK],
              ['عدد المعاملات', String(t.count), INK],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div style={{ color: '#6b6b6b' }}>{label}</div>
                <div className="font-bold" dir="ltr" style={{ textAlign: 'right', color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OperationsTable({ rows, totals }: { rows: JournalRow[]; totals: JournalTotals[] }) {
  return (
    <Table
      head={['م', 'التاريخ', 'المرجع', 'النوع', 'البيان', 'من ← إلى', 'وارد', 'منصرف', 'الحالة']}
      foot={totals.map((t) => (
        <TotalRow
          key={t.currency}
          cells={[
            <Td key="l" />,
            <Td key="t" strong>
              {`الإجمالي (${CURRENCIES[t.currency].label})`}
            </Td>,
            <Td key="e1" />,
            <Td key="e2" />,
            <Td key="e3">{`${t.count} معاملة`}</Td>,
            <Td key="e4" />,
            <Td key="in" ltr strong tone="in">
              {money(t.in, t.currency)}
            </Td>,
            <Td key="out" ltr strong tone="out">
              {money(t.out, t.currency)}
            </Td>,
            <Td key="e5" />,
          ]}
        />
      ))}
    >
      {rows.map((r, i) => (
        <tr key={`${r.type}-${r.id}`} style={{ background: i % 2 ? '#faf8f3' : '#fff', breakInside: 'avoid' }}>
          <Td className="text-center">{i + 1}</Td>
          <Td className="whitespace-nowrap">{day(r.operationDate)}</Td>
          <Td ltr className="whitespace-nowrap">
            {r.ref}
          </Td>
          <Td className="whitespace-nowrap">{JOURNAL_TYPES[r.type].label}</Td>
          <Td>
            {r.counterparty && <div className="font-semibold">{r.counterparty}</div>}
            <div>{r.description}</div>
            {r.fileNo && <div style={{ color: GOLD }}>ملف {r.fileNo}</div>}
          </Td>
          <Td>
            {r.fromAccount?.name ?? '—'} ← {r.toAccount?.name ?? '—'}
          </Td>
          <Td ltr tone="in" className="whitespace-nowrap">
            {r.flow === 'IN' ? money(r.amount, r.currency) : r.flow === 'MOVE' ? `(${money(r.amount, r.currency)})` : ''}
          </Td>
          <Td ltr tone="out" className="whitespace-nowrap">
            {r.flow === 'OUT' ? money(r.amount, r.currency) : ''}
          </Td>
          <Td className="whitespace-nowrap">{STATUS[r.approvalStatus].label}</Td>
        </tr>
      ))}
    </Table>
  );
}

function JournalBody({ report }: { report: JournalReport }) {
  return (
    <>
      <SectionTitle n={1}>ملخص التقرير</SectionTitle>
      <Kpis totals={report.summary.totals} />
      {report.summary.byType.length > 0 && (
        <div className="mt-3">
          <Table head={['النوع', 'العملة', 'عدد', 'وارد', 'منصرف', 'تحويلات بين الحسابات']}>
            {report.summary.byType.map((t) => (
              <tr key={`${t.type}-${t.currency}`}>
                <Td strong>{JOURNAL_TYPES[t.type].label}</Td>
                <Td>{CURRENCIES[t.currency].label}</Td>
                <Td>{t.count}</Td>
                <Td ltr tone="in">
                  {Number(t.in) ? money(t.in, t.currency) : '—'}
                </Td>
                <Td ltr tone="out">
                  {Number(t.out) ? money(t.out, t.currency) : '—'}
                </Td>
                <Td ltr>{Number(t.moved) ? money(t.moved, t.currency) : '—'}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <SectionTitle n={2}>التفاصيل</SectionTitle>
      <OperationsTable rows={report.rows} totals={report.summary.totals} />
      <p className="mt-2 text-[10px]" style={{ color: '#6b6b6b' }}>
        المبالغ بين قوسين تحويلات بين حسابات المكتب، ومش داخلة في الوارد والمنصرف.
      </p>
    </>
  );
}

function ExpensesBody({ report }: { report: ExpensesReport }) {
  const totals = new Map(report.summary.totals.map((t) => [t.currency, Number(t.out)]));
  return (
    <>
      <SectionTitle n={1}>ملخص التقرير</SectionTitle>
      <Table head={['بند المصروف', 'العملة', 'عدد', 'الإجمالي', 'النسبة']}>
        {report.summary.byItem.map((b) => (
          <tr key={`${b.name}-${b.currency}`}>
            <Td strong>{b.name}</Td>
            <Td>{CURRENCIES[b.currency].label}</Td>
            <Td>{b.count}</Td>
            <Td ltr strong>
              {money(b.total, b.currency)}
            </Td>
            <Td ltr>{totals.get(b.currency) ? `${((Number(b.total) / totals.get(b.currency)!) * 100).toFixed(1)}%` : '—'}</Td>
          </tr>
        ))}
        {report.summary.totals.map((t) => (
          <TotalRow
            key={t.currency}
            cells={[
              <Td key="l" strong>
                {`الإجمالي (${CURRENCIES[t.currency].label})`}
              </Td>,
              <Td key="c" />,
              <Td key="n" strong>
                {t.count}
              </Td>,
              <Td key="v" ltr strong>
                {money(t.out, t.currency)}
              </Td>,
              <Td key="p" ltr>
                100%
              </Td>,
            ]}
          />
        ))}
      </Table>
      {report.summary.byItem.length === 0 && <p className="mt-2 text-sm">مفيش مصاريف في الفترة دي.</p>}
      <SectionTitle n={2}>التفاصيل</SectionTitle>
      <OperationsTable rows={report.rows} totals={report.summary.totals} />
    </>
  );
}

function AccountsBody({ report }: { report: AccountsReport }) {
  const byCurrency = (['EGP', 'USD'] as Currency[])
    .map((c) => ({ c, list: report.summary.accounts.filter((a) => a.account.currency === c) }))
    .filter((g) => g.list.length);
  const sum = (list: AccountsReport['summary']['accounts'], k: 'opening' | 'in' | 'out' | 'closing') => list.reduce((s, a) => s + Number(a[k]), 0);
  return (
    <>
      <SectionTitle n={1}>ملخص التقرير</SectionTitle>
      <Table head={['الخزنة / الحساب', 'العملة', 'رصيد أول المدة', 'وارد', 'منصرف', 'رصيد آخر المدة']}>
        {byCurrency.map(({ c, list }) => (
          <AccountsGroup key={c} currency={c} list={list} sum={sum} />
        ))}
      </Table>
      <SectionTitle n={2}>التفاصيل</SectionTitle>
      <div className="space-y-5">
        {report.accounts.map((a) => (
          <div key={a.account.id} style={{ breakInside: 'auto' }}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 border-b-2 pb-1" style={{ borderColor: GOLD }}>
              <span className="font-bold">
                {a.account.name}
                {a.account.bankName && (
                  <span className="ms-2 text-[11px] font-normal" style={{ color: '#6b6b6b' }}>
                    {a.account.bankName} · <span dir="ltr">{a.account.accountNumber}</span>
                  </span>
                )}
              </span>
              <span className="text-[11px]">
                رصيد أول المدة: <b dir="ltr">{money(a.opening, a.account.currency)}</b>
              </span>
            </div>
            {a.lines.length === 0 ? (
              <p className="text-[11px]" style={{ color: '#6b6b6b' }}>
                مفيش حركة في الفترة دي.
              </p>
            ) : (
              <Table
                head={['التاريخ', 'المرجع', 'البيان', 'وارد', 'منصرف', 'الرصيد']}
                foot={
                  <TotalRow
                    cells={[
                      <Td key="l" strong>
                        الإجمالي
                      </Td>,
                      <Td key="e" />,
                      <Td key="n">{`${a.lines.length} حركة`}</Td>,
                      <Td key="i" ltr strong tone="in">
                        {num(a.in)}
                      </Td>,
                      <Td key="o" ltr strong tone="out">
                        {num(a.out)}
                      </Td>,
                      <Td key="b" ltr strong>
                        {money(a.closing, a.account.currency)}
                      </Td>,
                    ]}
                  />
                }
              >
                {a.lines.map((l, i) => (
                  <tr key={l.id} style={{ background: i % 2 ? '#faf8f3' : '#fff', breakInside: 'avoid' }}>
                    <Td className="whitespace-nowrap">{day(l.date)}</Td>
                    <Td ltr className="whitespace-nowrap">
                      {l.ref ?? '—'}
                    </Td>
                    <Td>
                      {l.reversal && <b style={{ color: '#b45309' }}>قيد عكسي · </b>}
                      {JOURNAL_TYPES[l.source]?.label}
                      {l.counterparty && ` · ${l.counterparty}`}
                      {l.description && <div style={{ color: '#555' }}>{l.description}</div>}
                    </Td>
                    <Td ltr tone="in">
                      {l.direction === 'IN' ? num(l.amount) : ''}
                    </Td>
                    <Td ltr tone="out">
                      {l.direction === 'OUT' ? num(l.amount) : ''}
                    </Td>
                    <Td ltr strong>
                      {num(l.balance)}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function AccountsGroup({
  currency,
  list,
  sum,
}: {
  currency: Currency;
  list: AccountsReport['summary']['accounts'];
  sum: (list: AccountsReport['summary']['accounts'], k: 'opening' | 'in' | 'out' | 'closing') => number;
}) {
  return (
    <>
      {list.map((a) => (
        <tr key={a.account.id}>
          <Td strong>{a.account.name}</Td>
          <Td>{CURRENCIES[currency].label}</Td>
          <Td ltr>{num(a.opening)}</Td>
          <Td ltr tone="in">
            {num(a.in)}
          </Td>
          <Td ltr tone="out">
            {num(a.out)}
          </Td>
          <Td ltr strong>
            {num(a.closing)}
          </Td>
        </tr>
      ))}
      <TotalRow
        cells={[
          <Td key="l" strong>
            {`إجمالي ${CURRENCIES[currency].label}`}
          </Td>,
          <Td key="c" />,
          <Td key="o" ltr strong>
            {money(sum(list, 'opening'), currency)}
          </Td>,
          <Td key="i" ltr strong tone="in">
            {money(sum(list, 'in'), currency)}
          </Td>,
          <Td key="u" ltr strong tone="out">
            {money(sum(list, 'out'), currency)}
          </Td>,
          <Td key="c2" ltr strong>
            {money(sum(list, 'closing'), currency)}
          </Td>,
        ]}
      />
    </>
  );
}

/**
 * A finance report on the company's letterhead (A4, right to left): the company, the
 * report and its period, the summary, the detail, then the signatures.
 */
export function ReportDocument({
  report,
  company,
  filters,
  generatedBy,
}: {
  report: Report;
  company: CompanySettings;
  filters: string[];
  generatedBy: string;
}) {
  return (
    <div className="report-page mx-auto bg-white px-9 py-8 text-[12px] leading-relaxed" dir="rtl" style={{ width: '210mm', minHeight: '297mm', color: INK }}>
      <header className="flex items-start justify-between gap-6 border-b-4 pb-4" style={{ borderColor: GOLD }}>
        <div className="space-y-0.5">
          <div className="text-[19px] font-extrabold" style={{ color: INK }}>
            {company.name}
          </div>
          <div>{company.address}</div>
          <div>
            الرقم الضريبي: <span dir="ltr">{company.taxNumber}</span> · السجل التجاري: <span dir="ltr">{company.crNumber}</span>
          </div>
          {company.emails.length > 0 && (
            <div dir="ltr" style={{ textAlign: 'right' }}>
              {company.emails.join(' · ')}
            </div>
          )}
        </div>
        <img src="/logo-full.png" alt="" className="h-20 w-auto object-contain" />
      </header>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold" style={{ color: INK }}>
            {REPORT_KINDS[report.kind].title}
          </h1>
          <div className="mt-1 text-[13px]">
            الفترة: من <b>{day(report.from)}</b> إلى <b>{day(report.to)}</b>
          </div>
        </div>
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: GOLD_SOFT }}>
          <div>
            طلّعه: <b>{generatedBy}</b>
          </div>
          <div>في: {stamp(report.generatedAt)}</div>
        </div>
      </div>
      {filters.length > 0 && <div className="mt-2 text-[11px]" style={{ color: '#555' }}>{filters.join(' · ')}</div>}
      {report.truncated && (
        <div className="mt-2 rounded border px-2 py-1 text-[11px]" style={{ borderColor: '#b45309', color: '#b45309' }}>
          التقرير كبير، واتعرض أول 20,000 سطر بس. قسّم الفترة علشان تشوف الباقي.
        </div>
      )}

      {report.kind === 'journal' && <JournalBody report={report} />}
      {report.kind === 'expenses' && <ExpensesBody report={report} />}
      {report.kind === 'accounts' && <AccountsBody report={report} />}

      <table className="mt-10 w-full border-collapse text-center text-[12px]" style={{ breakInside: 'avoid' }}>
        <thead>
          <tr>
            {['مراجعة', 'مدير الحسابات', 'الاعتماد'].map((h) => (
              <th key={h} className="w-1/3 border py-1.5 font-bold" style={{ borderColor: INK, background: GOLD_SOFT }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {[0, 1, 2].map((i) => (
              <td key={i} className="h-16 border" style={{ borderColor: INK }} />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

