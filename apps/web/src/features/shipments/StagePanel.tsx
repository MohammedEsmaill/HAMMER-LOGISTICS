import { Check } from 'lucide-react';
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

function MoveDrawer({ shipment, target, onClose }: { shipment: Shipment; target: StageStep | null; onClose: () => void }) {
  const current = shipment.stages.findIndex((s) => s.stage === shipment.currentStage);
  const backward = !!target && shipment.stages.findIndex((s) => s.stage === target.stage) < current;
  const to = target?.stage ?? '';
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
    if (!target) return;
    setOccurredAt('');
    setReason('');
    setProblem('');
    resetRef.current();
  }, [target]);

  const label = shipment.stages.find((s) => s.stage === to)?.label;
  const submit = () => {
    if (occurredAt && new Date(occurredAt) > new Date()) return setProblem('التاريخ مينفعش يبقى في المستقبل');
    setProblem('');
    move.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      title={backward ? `رجوع لـ «${target?.label}»` : `نقل الشحنة لـ «${target?.label}»`}
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
        {label && (
          <p className="rounded-xl bg-surface-2 p-3 text-sm">
            من <b>{shipment.stageLabel}</b> إلى <b className="text-gold">{label}</b>
          </p>
        )}
        <TextField
          label="حصلت إمتى؟ (اختياري)"
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

/**
 * "The shipment's current stage" at the top of the Nafeza tab: one list of the stages
 * of this shipment type. Forward one stage at a time, back to any earlier one; each
 * user only gets the stages they may set.
 */
export function StageSelect({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const [target, setTarget] = useState<StageStep | null>(null);
  const current = shipment.stages.findIndex((s) => s.stage === shipment.currentStage);
  const next = shipment.stages[current + 1];
  const finished = !next;
  const allowed = (s: StageStep, i: number) => i !== current && i <= current + 1 && can(GROUP_PERMISSION[s.group]);
  const movable = shipment.stages.some(allowed);

  return (
    <section className="space-y-3 rounded-2xl border border-gold/30 bg-gold/5 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <div className="text-sm text-muted">المرحلة الحالية للشحنة</div>
          <div className="mt-1 flex items-center gap-2 text-xl font-bold text-gold">
            {finished && <Check className="size-5 text-success" />}
            {shipment.stageLabel}
          </div>
          <div className="mt-1 text-xs text-muted">
            المرحلة {current + 1} من {shipment.stages.length}
            {next && ` · الجاية: ${next.label}`}
          </div>
        </div>
        {movable && (
          <div className="w-full sm:w-72">
            <SelectField
              label="تغيير المرحلة"
              placeholder="اختار المرحلة"
              value=""
              options={shipment.stages.map((s, i) => ({
                value: s.stage,
                label: i < current ? `${s.label} (رجوع)` : i === current ? `${s.label} (الحالية)` : s.label,
                disabled: !allowed(s, i),
              }))}
              onChange={(e) => setTarget(shipment.stages.find((s) => s.stage === e.target.value) ?? null)}
            />
          </div>
        )}
      </div>
      <MoveDrawer shipment={shipment} target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
