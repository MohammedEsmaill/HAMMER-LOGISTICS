import { ArrowRight, Calculator, RefreshCw } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/Spinner';
import NotFoundPage from '@/pages/NotFoundPage';
import { ApiError } from '@/lib/api-error';
import { useShipment, type Shipment } from './api';
import { CustomsTab } from './CustomsTab';
import { DocumentsTab } from './DocumentsTab';
import { FormTabs } from './FormTabs';
import { InspectionsTab } from './InspectionsTab';
import { MODE_ICONS } from './mode-icons';
import { OverviewTab } from './OverviewTab';
import { SHIPMENT_TYPES, STAGE_LABELS } from './rules';
import { StageSelect } from './StagePanel';

type Tab = 'overview' | 'customs' | 'documents' | 'history';

const dateTime = (iso: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function HistoryTab({ shipment }: { shipment: Shipment }) {
  const entries = [...shipment.stageHistory].reverse();
  if (!entries.length) return <EmptyState compact text="لسه مفيش حركة." />;
  return (
    <ol className="relative space-y-4 border-s border-line ps-6">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -start-[1.85rem] top-1 size-3 rounded-full ring-4 ring-surface ${e.movement === 'BACKWARD' ? 'bg-danger' : 'bg-gold'}`}
          />
          <div className="font-semibold">
            {e.from && <span className="text-muted">{STAGE_LABELS[e.from]} ← </span>}
            {shipment.stages.find((s) => s.stage === e.to)?.label ?? STAGE_LABELS[e.to]}
            {e.movement === 'BACKWARD' && (
              <span className="ms-2">
                <Badge tone="danger">رجوع</Badge>
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            {dateTime(e.at)}
            {e.recordedAt && e.recordedAt.slice(0, 16) !== e.at.slice(0, 16) && ` · اتسجلت ${dateTime(e.recordedAt)}`}
          </div>
          {e.reason && <p className="mt-1 text-sm">{e.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

export default function ShipmentDetailPage() {
  const id = Number(useParams().id);
  const { data: shipment, isLoading, error, refetch, isFetching } = useShipment(id);
  const [tab, setTab] = useState<Tab>('overview');
  const { canAny } = useAuth();

  if (!Number.isInteger(id) || id < 1 || (error instanceof ApiError && error.status === 404)) {
    return <NotFoundPage message="الشحنة دي مش موجودة أو مش من الشحنات اللي تقدر تشوفها." />;
  }
  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (error || !shipment) return <ErrorBox error={error} />;

  const rules = SHIPMENT_TYPES[shipment.kind];
  const Icon = MODE_ICONS[shipment.mode];
  const finished = shipment.currentStage === shipment.stages.at(-1)?.stage;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'البيانات' },
    { key: 'customs', label: 'النافذة', count: shipment.inspections.length || undefined },
    { key: 'documents', label: 'المستندات', count: shipment.documents.length },
    { key: 'history', label: 'سجل المراحل' },
  ];

  return (
    <div className="space-y-5">
      <Link to="/shipments" className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowRight className="size-4" /> الشحنات
      </Link>
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 place-items-center rounded-2xl gold-fill">
          <Icon className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-wide" dir="ltr" style={{ textAlign: 'right' }}>
            {shipment.fileNo}
          </h1>
          <div className="text-sm text-muted">
            {rules.label} · {shipment.client.name} · {shipment.commodity}
          </div>
        </div>
        <span
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${finished ? 'border-success/30 bg-success/12 text-success' : 'border-gold/30 bg-gold/10 text-gold'}`}
          title="المرحلة الحالية"
        >
          {shipment.stageLabel}
        </span>
        {canAny('finance.shipment-account.view', 'finance.statement.manage', 'finance.collections.manage') && (
          <Link to={`/shipment-accounts/${shipment.id}`} className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm hover:border-gold/60 hover:text-gold">
            <Calculator className="size-4" /> حساب الشحنة
          </Link>
        )}
        <button
          type="button"
          onClick={() => refetch()}
          className="focus-ring rounded-lg p-2 text-muted hover:bg-gold/10 hover:text-gold"
          title="تحديث"
          aria-label="تحديث بيانات الشحنة"
        >
          <RefreshCw className={`size-5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </motion.header>

      <FormTabs tabs={tabs} active={tab} onChange={setTab} layoutId="shipment-tab" />
      <div className="card p-5">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            {tab === 'overview' && <OverviewTab shipment={shipment} />}
            {tab === 'customs' && (
              <div className="space-y-6">
                <StageSelect shipment={shipment} />
                <section className="space-y-3">
                  <h3 className="font-bold">بيانات النافذة</h3>
                  <CustomsTab shipment={shipment} />
                </section>
                <section className="space-y-3 border-t border-line pt-5">
                  <h3 className="font-bold">العروض الرقابية</h3>
                  <InspectionsTab shipment={shipment} />
                </section>
              </div>
            )}
            {tab === 'documents' && <DocumentsTab shipment={shipment} />}
            {tab === 'history' && <HistoryTab shipment={shipment} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
