import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { PageHeader } from '@/components/ui/misc';
import { useAction } from '@/lib/mutations';
import { shipmentKeys, shipmentsApi } from './api';
import { MODE_ICONS } from './mode-icons';
import { KIND_LIST, SHIPMENT_TYPES, type ShipmentKind } from './rules';
import { EMPTY_FORM, errorsByTab, focusFirstInvalid, shipmentSchema, toShipmentInput, type ShipmentFormIn, type ShipmentFormOut } from './shipment-form';
import { BasicFields, ContainerFields, ShippingFields, type FormTab } from './ShipmentFields';
import { FormTabs } from './FormTabs';

function TypePicker({ onPick }: { onPick: (kind: ShipmentKind) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {KIND_LIST.map((t, i) => {
        const Icon = MODE_ICONS[t.mode];
        return (
          <motion.button
            key={t.kind}
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            onClick={() => onPick(t.kind)}
            className="card focus-ring group flex items-center gap-4 p-5 text-start transition-colors hover:border-gold/60"
          >
            <span
              className={`grid size-14 shrink-0 place-items-center rounded-2xl ${t.direction === 'IMPORT' ? 'gold-fill' : 'bg-gold/10 text-gold'}`}
            >
              <Icon className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold">{t.label}</span>
              <span className="block text-sm text-muted">{t.hint}</span>
            </span>
            <ChevronLeft className="size-5 text-muted transition-transform group-hover:-translate-x-1 group-hover:text-gold" />
          </motion.button>
        );
      })}
    </div>
  );
}

function RegistrationForm({ kind, onBack }: { kind: ShipmentKind; onBack: () => void }) {
  const rules = SHIPMENT_TYPES[kind];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const schema = useMemo(() => shipmentSchema(rules), [rules]);
  const form = useForm<ShipmentFormIn, unknown, ShipmentFormOut>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY_FORM, ...(rules.containers ? { loadType: 'FCL', containers: [{ containerNo: '', type: 'HQ40', weight: '' }] } : {}) },
  });
  const tabs: { key: FormTab; label: string }[] = [
    { key: 'basic', label: 'البيانات الأساسية' },
    { key: 'shipping', label: rules.freeZone ? 'المنطقة الحرة' : 'بيانات الشحن' },
    ...(rules.containers ? [{ key: 'containers' as const, label: 'الحاويات' }] : []),
  ];
  const [tab, setTab] = useState<FormTab>('basic');
  const save = useAction((values: ShipmentFormOut) => shipmentsApi.create(toShipmentInput(rules, values)), {
    invalidate: [shipmentKeys.all],
  });

  const errorCounts = errorsByTab(form.formState.errors).counts;
  // to the first tab with an error, and into its first wrong field
  const onInvalid = (errors: FieldErrors<ShipmentFormIn>) => {
    const { counts } = errorsByTab(errors);
    const target = tabs.find((t) => counts.has(t.key));
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (target) {
      setTab(target.key);
      focusFirstInvalid();
    }
    toast.error(`فيه ${total} خانة ناقصة أو غلط، راجع الخانات اللي باللون الأحمر`);
  };
  const onValid = async (values: ShipmentFormOut) => {
    try {
      const shipment = await save.mutateAsync(values);
      queryClient.setQueryData(shipmentKeys.one(shipment.id), shipment);
      toast.success(`اتسجلت الشحنة ${shipment.fileNo}`);
      navigate(`/shipments/${shipment.id}`, { replace: true });
    } catch {
      // shown in the ErrorBox
    }
  };

  const index = tabs.findIndex((t) => t.key === tab);
  const Icon = MODE_ICONS[rules.mode];

  return (
    <form noValidate onSubmit={form.handleSubmit(onValid, onInvalid)} className="space-y-5">
      <div className="card flex items-center gap-3 p-4">
        <span className="grid size-11 place-items-center rounded-xl gold-fill">
          <Icon className="size-5" />
        </span>
        <div className="flex-1">
          <div className="font-bold">{rules.label}</div>
          <div className="text-sm text-muted">رقم الملف بيتعمل تلقائي بعد الحفظ</div>
        </div>
        <Button type="button" variant="ghost" className="h-10 px-3 text-sm" icon={<ArrowRight className="size-4" />} onClick={onBack}>
          تغيير النوع
        </Button>
      </div>

      <FormTabs tabs={tabs} active={tab} onChange={setTab} errorCounts={errorCounts} layoutId="new-shipment-tab" />

      <div className="card p-5">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
            {/* every tab stays registered: hidden tabs keep their values and errors */}
            {tab === 'basic' && <BasicFields form={form} rules={rules} />}
            {tab === 'shipping' && <ShippingFields form={form} rules={rules} withOperation />}
            {tab === 'containers' && <ContainerFields form={form} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {save.error ? <ErrorBox error={save.error} /> : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="ghost" disabled={index === 0} onClick={() => setTab(tabs[index - 1].key)}>
          السابق
        </Button>
        <div className="flex gap-3">
          {index < tabs.length - 1 && (
            <Button type="button" variant="ghost" onClick={() => setTab(tabs[index + 1].key)}>
              التالي
            </Button>
          )}
          <Button type="submit" loading={save.isPending}>
            تسجيل الشحنة
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function NewShipmentPage() {
  const [kind, setKind] = useState<ShipmentKind | null>(null);
  return (
    <>
      <PageHeader title="تسجيل شحنة جديدة" description={kind ? 'املا البيانات في التبويبات، والحفظ بيراجع كل حاجة قبل ما يبعت.' : 'اختار نوع الشحنة.'} />
      {kind ? <RegistrationForm key={kind} kind={kind} onBack={() => setKind(null)} /> : <TypePicker onPick={setKind} />}
    </>
  );
}
