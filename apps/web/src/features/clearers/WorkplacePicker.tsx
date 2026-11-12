import { X } from 'lucide-react';
import { ComboField } from '@/components/ui/ComboField';
import { useLookup, usePorts } from '../lookups/api';

export interface Workplaces {
  portIds: number[];
  freeZoneIds: number[];
}

/** جهة التخليص: Egyptian ports / airports and free zones, picked one by one, removed by their ×. */
export function WorkplacePicker({ value, onChange }: { value: Workplaces; onChange: (v: Workplaces) => void }) {
  const { data: ports = [] } = usePorts({ egyptian: true });
  const { data: zones = [] } = useLookup('free-zones');
  const options = [
    ...ports.filter((p) => !value.portIds.includes(p.id)).map((p) => ({ value: `p${p.id}`, label: p.name })),
    ...zones.filter((z) => !value.freeZoneIds.includes(z.id)).map((z) => ({ value: `z${z.id}`, label: z.name })),
  ];
  const chosen = [
    ...value.portIds.map((id) => ({ key: `p${id}`, label: ports.find((p) => p.id === id)?.name ?? '…' })),
    ...value.freeZoneIds.map((id) => ({ key: `z${id}`, label: zones.find((z) => z.id === id)?.name ?? '…' })),
  ];
  const add = (picked: string | number) => {
    const v = String(picked);
    const id = Number(v.slice(1));
    if (!id) return;
    if (v.startsWith('p')) onChange({ ...value, portIds: [...value.portIds, id] });
    else onChange({ ...value, freeZoneIds: [...value.freeZoneIds, id] });
  };
  const remove = (key: string) => {
    const id = Number(key.slice(1));
    onChange(
      key.startsWith('p')
        ? { ...value, portIds: value.portIds.filter((p) => p !== id) }
        : { ...value, freeZoneIds: value.freeZoneIds.filter((z) => z !== id) },
    );
  };
  return (
    <div className="space-y-2">
      <ComboField label="جهة التخليص" placeholder="اختار ميناء أو منطقة حرة" options={options} value="" onChange={add} />
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chosen.map((c) => (
            <span key={c.key} className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 py-1 ps-3 pe-1 text-sm">
              {c.label}
              <button type="button" onClick={() => remove(c.key)} className="focus-ring grid size-6 place-items-center rounded-full text-muted hover:text-danger" aria-label={`شيل ${c.label}`}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
