import { AlertTriangle } from 'lucide-react';
import { useWatch, type Control } from 'react-hook-form';
import { formatDate } from '@/lib/format';
import { useDocWarnings } from '../documents/api';
import type { ShipmentFormIn } from './shipment-form';

/** While registering: the client's or factory's papers that expired or expire soon (a warning only). */
export function DocWarnings({ control }: { control: Control<ShipmentFormIn> }) {
  const [clientId, factoryId] = useWatch({ control, name: ['clientId', 'factoryId'] });
  const { data } = useDocWarnings(Number(clientId) || undefined, Number(factoryId) || undefined);
  if (!data?.length) return null;
  const expired = data.some((d) => d.status === 'EXPIRED');
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${expired ? 'border-danger/40 bg-danger/8' : 'border-gold/40 bg-gold/8'}`}>
      <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${expired ? 'text-danger' : 'text-gold'}`} />
      <div className="text-sm">
        <div className="font-semibold">مستندات العميل محتاجة تجديد</div>
        <ul className="mt-1 space-y-0.5">
          {data.map((d, i) => (
            <li key={i}>
              {d.name}: {d.status === 'EXPIRED' ? <b className="text-danger">منتهي من {formatDate(d.expiryDate)}</b> : <b className="text-gold">ينتهي {formatDate(d.expiryDate)} (باقي {d.daysLeft} يوم)</b>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
