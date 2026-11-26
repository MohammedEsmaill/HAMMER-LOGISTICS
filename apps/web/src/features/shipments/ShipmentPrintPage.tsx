import { ArrowRight, Printer } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { AR } from '@/lib/format';
import { useLookup } from '../lookups/api';
import { useCompany, type CompanySettings } from '../finance/account-api';
import { DOCUMENT_CATEGORIES, useShipment, type Shipment } from './api';
import { CONTAINER_TYPES, CUSTOMS_LABELS, partyLabels, REGIMES, SHIPMENT_TYPES } from './rules';

const INK = '#141414';
const GOLD = '#a8791f';
const GOLD_SOFT = '#f6efdc';
const LINE = '#d9d2c3';

const RESULTS = { PENDING: 'منتظر', ACCEPTED: 'مقبول', REJECTED: 'مرفوض' } as const;

/** 2026-11-15 → 15/11/2026 */
const day = (v: string | null | undefined) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');
const stamp = (d: Date) => new Intl.DateTimeFormat(AR, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
const weight = (v: string | number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(v));

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section style={{ breakInside: 'avoid' }}>
      <h2 className="mt-6 mb-2.5 flex items-center gap-2 text-[15px] font-bold" style={{ color: INK }}>
        <span className="grid size-6 place-items-center rounded-full text-xs text-white" style={{ background: GOLD }}>
          {n}
        </span>
        {title}
        <span className="h-px flex-1" style={{ background: LINE }} />
      </h2>
      {children}
    </section>
  );
}

type Field = [label: string, value: ReactNode, ltr?: boolean];

/** Label/value pairs, two to a row. */
function Fields({ rows }: { rows: Field[] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <div className="grid grid-cols-2 border-t border-s" style={{ borderColor: LINE }}>
      {shown.map(([label, value, ltr]) => (
        <div key={label} className="flex border-e border-b" style={{ borderColor: LINE }}>
          <div className="w-36 shrink-0 px-2 py-1.5 font-semibold" style={{ background: GOLD_SOFT }}>
            {label}
          </div>
          <div className="min-w-0 flex-1 px-2 py-1.5 break-words" dir={ltr ? 'ltr' : undefined} style={{ textAlign: ltr ? 'right' : undefined }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr style={{ background: INK, color: '#f1d27a' }}>
          {head.map((h) => (
            <th key={h} className="border px-2 py-1.5 text-start font-bold" style={{ borderColor: INK }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
            {r.map((c, j) => (
              <td key={j} className="border px-2 py-1" style={{ borderColor: LINE }}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ShipmentDocument({ s, company, printedBy, authorities }: { s: Shipment; company: CompanySettings; printedBy: string; authorities: Map<number, string> }) {
  const rules = SHIPMENT_TYPES[s.kind];
  const labels = partyLabels(s.direction);
  const air = s.mode === 'AIR';
  let n = 0;

  // مقدم البيان stays off the printed sheet
  const customs: Field[] = rules.customsFields.filter((f) => f !== 'declarantId').map((f) => {
    if (f === 'storageYardId') return [CUSTOMS_LABELS[f], s.storageYard?.name];
    if (f === 'certificateNo') return [CUSTOMS_LABELS[f], s.certificateNo, true];
    return [CUSTOMS_LABELS[f], day(s[f])];
  });

  return (
    <div className="report-page mx-auto bg-white px-9 py-8 text-[12px] leading-relaxed" dir="rtl" style={{ width: '210mm', minHeight: '297mm', color: INK }}>
      <header className="flex items-start justify-between gap-6 border-b-4 pb-4" style={{ borderColor: GOLD }}>
        <div className="space-y-0.5">
          <div className="text-[19px] font-extrabold">{company.name}</div>
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
          <h1 className="text-[22px] font-extrabold">بيانات الشحنة</h1>
          <div className="mt-1 text-[14px]">
            رقم الملف: <b dir="ltr">{s.fileNo}</b> · {rules.label}
          </div>
          <div className="mt-0.5">
            المرحلة الحالية: <b>{s.stageLabel}</b>
          </div>
        </div>
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: GOLD_SOFT }}>
          <div>
            طُبعت بواسطة: <b>{printedBy}</b>
          </div>
          <div>في: {stamp(new Date())}</div>
        </div>
      </div>

      <Section n={++n} title="البيانات الأساسية">
        <Fields
          rows={[
            ['العميل', s.client.name],
            ['المصنع', s.factory.name],
            ['المستخلص', s.clearer.fullName],
            [labels.foreignParty, s.foreignPartyName],
            [labels.country, s.country.nameAr],
            [labels.consignee, s.consignee],
            ['نوع البضاعة', s.commodity],
            ...(rules.customsRegime ? [['النظام الجمركي', s.customsRegime && REGIMES[s.customsRegime]] as Field] : []),
            ['تاريخ الإخطار', day(s.notificationDate)],
            ['عدد الطرود', s.packagesCount],
            ['الوزن الكلي', `${weight(s.totalWeight)} كجم`],
            ['تاريخ التسجيل', day(s.createdAt)],
          ]}
        />
      </Section>

      <Section n={++n} title={rules.freeZone ? 'المنطقة الحرة' : 'بيانات الشحن'}>
        <Fields
          rows={[
            ...(rules.carrierKind ? [[air ? 'شركة الطيران' : 'الخط الملاحي', s.carrier?.name] as Field] : []),
            ...(rules.route
              ? ([
                  [air ? 'مطار الشحن' : 'ميناء الشحن', s.loadingPort?.name],
                  [air ? 'مطار الوصول' : 'ميناء الوصول', s.dischargePort?.name],
                ] as Field[])
              : []),
            ...(rules.freeZone ? [['المنطقة الحرة', s.freeZone?.name] as Field] : []),
            ...(rules.reference ? [[rules.reference, s.referenceNumber, true] as Field] : []),
            ...(rules.masterBill !== 'none'
              ? ([
                  [air ? 'MAWB' : 'MB/L', s.mblNumber, true],
                  [air ? 'HAWB' : 'HB/L', s.hblNumber, true],
                ] as Field[])
              : []),
            ...(rules.voyageAndBooking
              ? ([
                  ['رقم الرحلة', s.voyageNo, true],
                  ['رقم الحجز', s.bookingNo, true],
                ] as Field[])
              : []),
            ...(rules.containers ? [['نوع الشحن', s.loadType] as Field] : []),
          ]}
        />
      </Section>

      {rules.containers && s.containers.length > 0 && (
        <Section n={++n} title={`الحاويات (${s.containers.length})`}>
          <Table
            head={['م', 'رقم الحاوية', 'النوع', 'الوزن (كجم)']}
            rows={s.containers.map((c) => [c.seq, <span dir="ltr">{c.containerNo ?? '—'}</span>, CONTAINER_TYPES[c.type], <span dir="ltr">{weight(c.weight)}</span>])}
          />
        </Section>
      )}

      <Section n={++n} title="بيانات التشغيل">
        <Fields
          rows={[
            ...(s.mode !== 'FREE_ZONE'
              ? ([
                  [air ? 'الطائرة / الرحلة' : 'اسم السفينة', s.vesselName],
                  ['تاريخ الوصول المتوقع', day(s.eta)],
                ] as Field[])
              : []),
            ['موظف الأوبريشن', s.operationEmployee.fullName],
          ]}
        />
      </Section>

      {customs.some(([, v]) => v) && (
        <Section n={++n} title="بيانات النافذة">
          <Fields rows={customs} />
        </Section>
      )}

      {s.inspections.length > 0 && (
        <Section n={++n} title="العروض الرقابية">
          <Table
            head={['الجهة', 'تاريخ الطلب', 'النتيجة', 'تاريخ النتيجة', 'ملاحظات']}
            rows={s.inspections.map((i) => [authorities.get(i.authorityId) ?? '—', day(i.requestedAt), RESULTS[i.result], day(i.resultDate) || '—', i.notes ?? ''])}
          />
        </Section>
      )}

      {s.documents.length > 0 && (
        <Section n={++n} title={`المستندات المرفوعة (${s.documents.length})`}>
          <Table
            head={['م', 'اسم المستند', 'التصنيف', 'تاريخ الرفع']}
            rows={s.documents.map((d, i) => [i + 1, d.name, DOCUMENT_CATEGORIES[d.category].label, day(d.createdAt)])}
          />
        </Section>
      )}
    </div>
  );
}

/** A shipment's data on an A4 page, to print or save as PDF. */
export default function ShipmentPrintPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const { data: s, error } = useShipment(id);
  const { data: company } = useCompany();
  const { data: authorities = [] } = useLookup('inspection-authorities');

  useEffect(() => {
    if (s) document.title = `بيانات الشحنة ${s.fileNo}`;
    return () => {
      document.title = 'HAMMER LINE';
    };
  }, [s]);

  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!s || !company) {
    return (
      <div className="grid min-h-screen place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="report-print min-h-screen bg-neutral-300 pb-10 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <Link to={`/shipments/${s.id}`} className="flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> الشحنة {s.fileNo}
        </Link>
        <div className="flex-1" />
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <div className="py-6 print:py-0">
        <div className="mx-auto w-fit shadow-2xl print:shadow-none">
          <ShipmentDocument
            s={s}
            company={company}
            printedBy={user?.name || user?.email || ''}
            authorities={new Map(authorities.map((a) => [a.id, a.name]))}
          />
        </div>
      </div>
    </div>
  );
}
