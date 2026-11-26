import { ArrowRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { AR } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import { useCompany, type CompanySettings } from '../finance/account-api';
import { useLookup } from '../lookups/api';
import { useShipmentsReport, type ShipmentsQuery, type ShipmentsReport } from './api';
import { CONTAINER_TYPES, SHIPMENT_TYPES, STAGE_LABELS, type ContainerType, type ShipmentKind } from './rules';

const INK = '#141414';
const GOLD = '#a8791f';
const GOLD_SOFT = '#f6efdc';
const LINE = '#d9d2c3';

/** 2026-11-15 → 15/11/2026 */
export const reportDay = (v: string | null | undefined) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');
const stamp = (d: Date) => new Intl.DateTimeFormat(AR, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
const num = (v: string | number, digits = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(Number(v));

/** "40HQ × 2 · 20HQ × 1" */
export function containersText(types: Partial<Record<ContainerType, number>> | ContainerType[]) {
  const counts: Partial<Record<ContainerType, number>> = Array.isArray(types)
    ? types.reduce<Partial<Record<ContainerType, number>>>((acc, t) => ((acc[t] = (acc[t] ?? 0) + 1), acc), {})
    : types;
  return Object.entries(counts)
    .filter(([, n]) => n)
    .map(([t, n]) => `${CONTAINER_TYPES[t as ContainerType]} × ${n}`)
    .join(' · ');
}

type Filters = Pick<ShipmentsQuery, 'search' | 'kind' | 'stage' | 'declarantId'>;

/** The filters in words, for the report's header (Excel too). */
export function filterLabels(f: Filters, declarantName?: string): string[] {
  return [
    ...(f.kind ? [`النوع: ${SHIPMENT_TYPES[f.kind as ShipmentKind]?.label ?? f.kind}`] : []),
    ...(f.stage ? [`المرحلة: ${STAGE_LABELS[f.stage] ?? f.stage}`] : []),
    ...(f.declarantId ? [`مقدمُ البيان: ${declarantName ?? f.declarantId}`] : []),
    ...(f.search ? [`بحث: «${f.search}»`] : []),
  ];
}

/** The report's columns, shared by the printed page and the Excel file. */
export const REPORT_COLUMNS = [
  '#',
  'رقم الملف',
  'العميل / المصنع',
  'البوليصة',
  'الحاويات',
  'الطرود',
  'ميناء الوصول',
  'الخط / السفينة',
  'الوصول المتوقع',
  'المرحلة',
  'رقم الشهادة',
  'مقدمُ البيان',
  'مسؤول التشغيل',
  'المستخلص',
];

function ReportDocument({ report, filters, company, printedBy }: { report: ShipmentsReport; filters: string[]; company: CompanySettings; printedBy: string }) {
  const { summary } = report;
  const stats: [string, string, string?][] = [
    ['عدد الشحنات', num(summary.count)],
    ['الحاويات', num(Object.values(summary.containers).reduce((t, n) => t + (n ?? 0), 0)), containersText(summary.containers)],
    ['الطرود', num(summary.packages)],
    ['الوزن الكلي', `${num(summary.weight, 3)} كجم`],
  ];
  return (
    <div className="report-page mx-auto bg-white px-8 py-7 text-[11px] leading-relaxed" dir="rtl" style={{ width: '297mm', minHeight: '210mm', color: INK }}>
      <header className="flex items-start justify-between gap-6 border-b-4 pb-3" style={{ borderColor: GOLD }}>
        <div className="space-y-0.5">
          <div className="text-[17px] font-extrabold">{company.name}</div>
          <div>{company.address}</div>
        </div>
        <img src="/logo-full.png" alt="" className="h-16 w-auto object-contain" />
      </header>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold">تقرير الشحنات</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {filters.length ? (
              filters.map((f) => (
                <span key={f} className="rounded-full border px-2.5 py-0.5" style={{ borderColor: '#e2d6b4', background: GOLD_SOFT }}>
                  {f}
                </span>
              ))
            ) : (
              <span>كل الشحنات (من غير فلتر)</span>
            )}
          </div>
        </div>
        <div className="rounded-lg px-3 py-2 text-[10.5px]" style={{ background: GOLD_SOFT }}>
          <div>
            طُبع بواسطة: <b>{printedBy}</b>
          </div>
          <div>في: {stamp(new Date())}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {stats.map(([label, value, sub]) => (
          <div key={label} className="rounded-lg border px-3 py-2" style={{ borderColor: '#e2d6b4', background: '#fbf8f0' }}>
            <div className="text-[10px]" style={{ color: '#6f685a' }}>
              {label}
            </div>
            <div className="text-[15px] font-bold">{value}</div>
            {sub && (
              <div className="text-[10px]" dir="ltr" style={{ color: '#6f685a', textAlign: 'right' }}>
                {sub}
              </div>
            )}
          </div>
        ))}
      </div>

      <table className="mt-4 w-full border-collapse text-[10px]">
        <thead>
          <tr style={{ background: INK, color: '#f1d27a' }}>
            {REPORT_COLUMNS.map((h) => (
              <th key={h} className="border px-1.5 py-1.5 text-start font-bold whitespace-nowrap" style={{ borderColor: INK }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.items.map((s, i) => (
            <tr key={s.id} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>{i + 1}</td>
              <td className="border px-1.5 py-1 font-bold whitespace-nowrap" dir="ltr" style={{ borderColor: LINE, textAlign: 'right' }}>{s.fileNo}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>
                {s.client.name}
                <div style={{ color: '#6f685a' }}>{s.factory.name}</div>
              </td>
              <td className="border px-1.5 py-1" dir="ltr" style={{ borderColor: LINE, textAlign: 'right' }}>{s.hblDisplay ?? '—'}</td>
              <td className="border px-1.5 py-1 whitespace-nowrap" style={{ borderColor: LINE }}>{containersText(s.containers) || '—'}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>{num(s.packagesCount)}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>{s.place?.name ?? '—'}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>
                {s.carrier?.name ?? '—'}
                {s.vesselName && <div style={{ color: '#6f685a' }}>{s.vesselName}</div>}
              </td>
              <td className="border px-1.5 py-1 whitespace-nowrap" style={{ borderColor: LINE }}>{reportDay(s.eta) || '—'}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>{s.stageLabel}</td>
              <td className="border px-1.5 py-1" dir="ltr" style={{ borderColor: LINE, textAlign: 'right' }}>{s.certificateNo ?? '—'}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>{s.declarant?.name ?? '—'}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>{s.operationEmployee.fullName}</td>
              <td className="border px-1.5 py-1" style={{ borderColor: LINE }}>{s.clearer.fullName}</td>
            </tr>
          ))}
          {report.items.length === 0 && (
            <tr>
              <td colSpan={REPORT_COLUMNS.length} className="border px-2 py-4 text-center" style={{ borderColor: LINE }}>
                مفيش شحنات بالفلتر ده
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The shipments report: every shipment the list's filters match (taken from the
 * address, the same as the list), to print, save as PDF or download as Excel.
 */
export default function ShipmentsReportPage() {
  const [params] = useSearchParams();
  const filters: Filters = {
    search: params.get('search') ?? '',
    kind: (params.get('kind') ?? '') as Filters['kind'],
    stage: params.get('stage') ?? '',
    declarantId: params.get('declarantId') ? Number(params.get('declarantId')) : '',
  };
  const { user } = useAuth();
  const { data: report, error } = useShipmentsReport(filters);
  const { data: company } = useCompany();
  const { data: declarants = [] } = useLookup('declarants');
  const [exporting, setExporting] = useState(false);
  const labels = filterLabels(filters, declarants.find((d) => d.id === filters.declarantId)?.name);
  const printedBy = user?.name ?? '';

  useEffect(() => {
    document.title = 'تقرير الشحنات';
    return () => {
      document.title = 'HAMMER LINE';
    };
  }, []);

  const excel = async () => {
    if (!report || !company) return;
    setExporting(true);
    try {
      const { downloadShipmentsExcel } = await import('./shipments-report-excel');
      await downloadShipmentsExcel(report, company, labels);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!report || !company) {
    return (
      <div className="grid min-h-screen place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="report-print-landscape min-h-screen bg-neutral-300 pb-10 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <Link to={`/shipments?${params.toString()}`} className="flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> الشحنات
        </Link>
        <span className="text-sm text-muted">· {report.summary.count} شحنة</span>
        <div className="flex-1" />
        <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={excel}>
          Excel
        </Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <div className="overflow-x-auto py-6 print:overflow-visible print:py-0">
        <div className="mx-auto w-fit shadow-2xl print:shadow-none">
          <ReportDocument report={report} filters={labels} company={company} printedBy={printedBy} />
        </div>
      </div>
    </div>
  );
}
