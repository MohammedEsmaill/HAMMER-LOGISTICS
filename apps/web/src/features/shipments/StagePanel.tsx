import { Check, ChevronsLeft, Undo2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { shipmentsApi, type Shipment, type StageStep } from './api';
import { useShipmentAction } from './use-shipment-action';

const GROUP_PERMISSION = {
  AUTO: 'shipments.stage.operation',
  OPERATION: 'shipments.stage.operation',
  CUSTOMS: 'shipments.stage.customs',
} as const;

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function MoveDrawer({
  shipment,
  target,
  backward,
  onClose,
}: {
  shipment: Shipment;
  target: StageStep | null;
  backward: boolean;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const current = shipment.stages.findIndex((s) => s.stage === shipment.currentStage);
  const earlier = shipment.stages.slice(0, current).filter((s) => can(GROUP_PERMISSION[s.group]));
  const [to, setTo] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const move = useShipmentAction(shipment.id, () =>
    shipmentsApi.moveStage(shipment.id, {
      version: shipment.version,
      to,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      reason: reason.trim() || undefined,
    }),
  );
  const resetRef = useRef(move.reset);
  resetRef.current = move.reset;

  useEffect(() => {
    if (!target && !backward) return;
    setTo(target?.stage ?? '');
    setOccurredAt('');
    setReason('');
    setProblem('');
    resetRef.current();
  }, [target, backward]);

  const label = shipment.stages.find((s) => s.stage === to)?.label;
  const submit = () => {
    if (!to) return setProblem('اختار المرحلة');
    if (occurredAt && new Date(occurredAt) > new Date()) return setProblem('التاريخ مينفعش يبقى في المستقبل');
    setProblem('');
    move.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Drawer
      open={!!target || backward}
      onClose={onClose}
      title={backward ? 'رجوع لمرحلة سابقة' : `نقل الشحنة لـ «${target?.label}»`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={move.isPending} variant={backward ? 'danger' : 'primary'} onClick={submit}>
            {backward ? 'رجوع' : 'تأكيد'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {backward && (
          <SelectField
            label="المرحلة"
            options={earlier.map((s) => ({ value: s.stage, label: s.label }))}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        )}
        {label && (
          <p className="rounded-xl bg-surface-2 p-3 text-sm">
            من <b>{shipment.stageLabel}</b> إلى <b className="text-gold">{label}</b>
          </p>
        )}
        <TextField
          label="حصلت إمتى؟ (اختياري)"
          hint="سيبها فاضية لو حصلت دلوقتي. ممكن تسجّلها بتاريخ قديم لو اتأخرت في التسجيل."
          type="datetime-local"
          max={nowLocal()}
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
        <TextField
          label={backward ? 'السبب (يفضل تكتبه)' : 'ملاحظة (اختياري)'}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {move.error ? <ErrorBox error={move.error} /> : null}
      </div>
    </Drawer>
  );
}

/** The shipment's stage track, with the next move and a way back. */
export function StagePanel({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const [target, setTarget] = useState<StageStep | null>(null);
  const [backward, setBackward] = useState(false);
  const current = shipment.stages.findIndex((s) => s.stage === shipment.currentStage);
  const next = shipment.stages[current + 1];
  const canNext = next && can(GROUP_PERMISSION[next.group]);
  const canBack = current > 0 && shipment.stages.slice(0, current).some((s) => can(GROUP_PERMISSION[s.group]));
  const progress = shipment.stages.length > 1 ? current / (shipment.stages.length - 1) : 1;
  const track = useRef<HTMLOListElement>(null);

  useEffect(() => {
    track.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [current]);

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted">المرحلة الحالية</div>
          <div className="text-xl font-bold text-gold">{shipment.stageLabel}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canBack && (
            <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => setBackward(true)}>
              رجوع
            </Button>
          )}
          {canNext && (
            <Button icon={<ChevronsLeft className="size-4" />} onClick={() => setTarget(next)}>
              {next.label}
            </Button>
          )}
          {!next && <span className="rounded-xl bg-success/12 px-3 py-2 text-sm font-semibold text-success">الشحنة خلصت</span>}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full gold-fill" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      </div>

      <ol ref={track} className="flex gap-2 overflow-x-auto pb-1">
        {shipment.stages.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li
              key={s.stage}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                isCurrent ? 'border-gold bg-gold/12 text-gold' : s.done ? 'border-gold/30 text-ink' : 'border-line text-muted'
              }`}
            >
              <span
                className={`grid size-5 place-items-center rounded-full text-[10px] ${s.done ? 'gold-fill' : 'bg-surface-2 text-muted'}`}
              >
                {s.done && !isCurrent ? <Check className="size-3" /> : i + 1}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>
      <MoveDrawer
        shipment={shipment}
        target={target}
        backward={backward}
        onClose={() => {
          setTarget(null);
          setBackward(false);
        }}
      />
    </section>
  );
}
