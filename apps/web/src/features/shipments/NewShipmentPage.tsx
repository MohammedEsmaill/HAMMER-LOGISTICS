import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { PageHeader } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import { useAction } from '@/lib/mutations';
import { shipmentKeys, shipmentsApi, useClearerOptions, useClientOptions, useFactories } from './api';
import { MODE_ICONS } from './mode-icons';
import { CONTAINER_TYPES, KIND_LIST, SHIPMENT_TYPES, type ShipmentKind, type TypeRules } from './rules';
import { countBySection, EMPTY_FORM, errorPaths, focusFirstInvalid, shipmentSchema, toShipmentInput, type FormSection, type ShipmentFormIn, type ShipmentFormOut } from './shipment-form';
import { BasicFields, ContainerFields, ShippingFields, type ShipmentForm } from './ShipmentFields';
import { DocWarnings } from './DocWarnings';

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

const SECTION_TITLES: Record<FormSection, string> = {
  parties: 'العميل والمصنع',
  goods: 'البضاعة والجمارك',
  shipping: 'بيانات الشحن',
  containers: 'الحاويات',
};

function Section({
  id,
  n,
  title,
  problems,
  shown,
  children,
}: {
  id: string;
  n: number;
  title: string;
  problems: number;
  shown: boolean;
  children: React.ReactNode;
}) {
  const done = problems === 0;
  return (
    <section id={id} className={`card scroll-mt-24 space-y-4 p-5 ${shown && !done ? 'border-danger/50' : ''}`}>
      <h3 className="flex items-center gap-3 text-base font-bold">
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm ${done ? 'gold-fill' : 'border-2 border-gold/60 text-gold'}`}>
          {done ? <Check className="size-4" /> : n}
        </span>
        {title}
        {shown && !done && <span className="ms-auto rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">ناقص {problems}</span>}
      </h3>
      {children}
    </section>
  );
}

function RegistrationForm({ kind, onBack }: { kind: ShipmentKind; onBack: () => void }) {
  const rules = SHIPMENT_TYPES[kind];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const schema = useMemo(() => shipmentSchema(rules), [rules]);
  const form = useForm<ShipmentFormIn, unknown, ShipmentFormOut>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...EMPTY_FORM,
      ...(rules.containers
        ? {
            loadType: 'FCL',
            containers: [{ containerNo: '', type: 'HQ40', weight: '' }],
          }
        : {}),
    },
  });
  const sections: FormSection[] = ['parties', 'goods', 'shipping', ...(rules.containers ? (['containers'] as const) : [])];
  const titleOf = (k: FormSection) => (k === 'shipping' && rules.freeZone ? 'المنطقة الحرة' : SECTION_TITLES[k]);
  const save = useAction((values: ShipmentFormOut) => shipmentsApi.create(toShipmentInput(rules, values)), {
    invalidate: [shipmentKeys.all],
  });

  // what is still missing, section by section, checked as the user types
  const values = useWatch({ control: form.control });
  const missing = useMemo(() => {
    const parsed = schema.safeParse(values);
    return countBySection(parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.')));
  }, [schema, values]);
  // red marks only after the first try to save
  const tried = form.formState.submitCount > 0;

  const goTo = (k: FormSection) => document.getElementById(`section-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const onInvalid = (errors: FieldErrors<ShipmentFormIn>) => {
    const total = errorPaths(errors).length;
    focusFirstInvalid();
    toast.error(`فيه ${total} خانة ناقصة أو غلط، راجع الخانات اللي باللون الأحمر`);
  };
  const onValid = async (v: ShipmentFormOut) => {
    try {
      const shipment = await save.mutateAsync(v);
      queryClient.setQueryData(shipmentKeys.one(shipment.id), shipment);
      toast.success(`اتسجلت الشحنة ${shipment.fileNo}`);
      navigate(`/shipments/${shipment.id}`, { replace: true });
    } catch {
      // shown in the ErrorBox
    }
  };

  const Icon = MODE_ICONS[rules.mode];
  const body: Record<FormSection, React.ReactNode> = {
    parties: <BasicFields form={form} rules={rules} part="parties" />,
    goods: <BasicFields form={form} rules={rules} part="goods" />,
    shipping: <ShippingFields form={form} rules={rules} withOperation />,
    containers: <ContainerFields form={form} />,
  };
  const submit = (
    <Button type="submit" className="flex-[2]" loading={save.isPending}>
      تسجيل الشحنة
    </Button>
  );

  return (
    <form noValidate onSubmit={form.handleSubmit(onValid, onInvalid)} className="flex flex-wrap items-start gap-5 pb-20 lg:pb-0">
      <div className="min-w-0 flex-[999_1_560px] space-y-4">
        <DocWarnings control={form.control} />
        {sections.map((k, i) => (
          <Section key={k} id={`section-${k}`} n={i + 1} title={titleOf(k)} problems={missing.get(k) ?? 0} shown={tried}>
            {body[k]}
          </Section>
        ))}
        <p className="text-sm text-muted">المستندات (الفواتير والبوليصة) بتترفع من صفحة الشحنة بعد التسجيل.</p>
        {save.error ? <ErrorBox error={save.error} /> : null}
      </div>

      {/* the summary stays in view while the sections scroll */}
      <aside className="flex-[1_1_290px] space-y-4 lg:sticky lg:top-20">
        <div className="card space-y-3 p-5">
          <div className="flex items-center gap-3">
            <span className="gold-fill grid size-11 shrink-0 place-items-center rounded-xl">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{rules.label}</span>
                <button type="button" onClick={onBack} className="focus-ring flex items-center gap-1 rounded text-xs text-muted hover:text-gold">
                  <ArrowRight className="size-3.5" /> تغيير النوع
                </button>
              </div>
              <NextFileNo />
            </div>
          </div>
          <Summary form={form} rules={rules} />
        </div>

        <nav className="card p-4" aria-label="أقسام الفورم">
          <div className="mb-2 text-xs text-muted">الأقسام · دوس على أي قسم يوديك عليه</div>
          {sections.map((k, i) => {
            const n = missing.get(k) ?? 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => goTo(k)}
                className="focus-ring flex w-full items-center gap-3 rounded-lg py-1.5 text-start text-sm hover:text-gold"
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    n === 0 ? 'gold-fill' : tried ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {n === 0 ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="flex-1">{titleOf(k)}</span>
                {n > 0 && <span className={`text-xs ${tried ? 'text-danger' : 'text-muted'}`}>ناقص {n}</span>}
              </button>
            );
          })}
        </nav>

        <div className="hidden gap-3 lg:flex">
          <Button type="button" variant="ghost" className="flex-1" onClick={onBack}>
            إلغاء
          </Button>
          {submit}
        </div>
      </aside>

      {/* a phone keeps the save button at the bottom of the screen */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-line bg-bg/90 p-3 backdrop-blur-md lg:hidden">{submit}</div>
    </form>
  );
}

/** Who and what the shipment is so far, as the user fills the form. */
function Summary({ form, rules }: { form: ShipmentForm; rules: TypeRules }) {
  const [clientId, factoryId, clearerId, containers] = useWatch({
    control: form.control,
    name: ['clientId', 'factoryId', 'clearerId', 'containers'],
  });
  const { data: clients = [] } = useClientOptions(rules.direction);
  const { data: factories = [] } = useFactories(clientId ? Number(clientId) : undefined);
  const { data: clearers = [] } = useClearerOptions();
  const client = clients.find((c) => c.id === Number(clientId))?.name;
  const factory = factories.find((f) => f.id === Number(factoryId))?.name;
  const clearer = clearers.find((c) => c.id === Number(clearerId))?.fullName;
  const boxes = (containers ?? []).filter((c) => c?.containerNo || c?.type);
  const byType = Object.entries(boxes.reduce<Record<string, number>>((acc, c) => ((acc[c?.type ?? ''] = (acc[c?.type ?? ''] ?? 0) + 1), acc), {}))
    .map(([t, n]) => `${n} × ${CONTAINER_TYPES[t as keyof typeof CONTAINER_TYPES] ?? t}`)
    .join(' · ');
  const rows: [string, string | undefined][] = [
    ['العميل', client],
    ['المصنع', factory],
    ['المستخلص', clearer],
    ...(rules.containers ? ([['الحاويات', byType || undefined]] as [string, string | undefined][]) : []),
  ];
  return (
    <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-muted">{label}</dt>
          <dd className={`min-w-0 truncate ${value ? 'font-semibold' : 'text-muted'}`}>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The file number the shipment is likely to get. Only for information: the real one is
 * given on save, so someone registering at the same moment may take this one first.
 */
function NextFileNo() {
  const { data } = useQuery({
    queryKey: [...shipmentKeys.all, 'next-file-no'],
    queryFn: () => api.get<{ fileNo: string | null }>('/shipments/next-file-no'),
    refetchInterval: 30_000,
  });
  if (!data?.fileNo) return null;
  return (
    <div className="text-xs whitespace-nowrap text-muted" title="الرقم النهائي بيتحدد وقت الحفظ">
      رقم الملف المتوقع{' '}
      <b dir="ltr" className="text-gold">
        {data.fileNo}
      </b>
    </div>
  );
}

export default function NewShipmentPage() {
  const [kind, setKind] = useState<ShipmentKind | null>(null);
  return (
    <>
      <PageHeader title="تسجيل شحنة جديدة" actions={kind ? undefined : <NextFileNo />} />
      {kind ? <RegistrationForm key={kind} kind={kind} onBack={() => setKind(null)} /> : <TypePicker onPick={setKind} />}
    </>
  );
}
