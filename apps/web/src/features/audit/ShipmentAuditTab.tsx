import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { useShipmentHistory, type AuditRow } from './api';
import { AuditDrawer } from './AuditLogPage';
import { changedFields, when, who } from './format';
import { ACTION_TONE, ACTIONS } from './labels';

/** Everything done to the shipment, newest first (CEO and the general auditor). */
export function ShipmentAuditTab({ shipmentId }: { shipmentId: number }) {
  const { data, isLoading, error } = useShipmentHistory(shipmentId);
  const [open, setOpen] = useState<AuditRow | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (isLoading) return <div className="h-32 rounded-2xl shimmer" />;
  if (!data?.length) return <EmptyState compact text="لا توجد عمليات مسجلة" />;
  return (
    <>
      <ul className="space-y-2">
        {data.map((r) => {
          const fields = changedFields(r.before, r.after).map((f) => f.label);
          return (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="w-full rounded-xl border border-line p-3 text-start hover:border-gold/60">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ACTION_TONE[r.action] ?? 'gold'}>{ACTIONS[r.action] ?? r.action}</Badge>
                  {r.entity === 'shipment_document' && <span className="text-sm text-muted">مستند</span>}
                  <span className="font-semibold">{who(r)}</span>
                  <span className="ms-auto text-xs text-muted" dir="ltr">
                    {when(r.createdAt)}
                  </span>
                </div>
                {r.before && r.after && fields.length > 0 && (
                  <p className="mt-1 truncate text-sm text-muted">غيّر: {fields.slice(0, 6).join('، ')}{fields.length > 6 ? ' …' : ''}</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <AuditDrawer row={open} onClose={() => setOpen(null)} />
    </>
  );
}
