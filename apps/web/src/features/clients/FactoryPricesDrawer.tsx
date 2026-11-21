import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { useAction } from '@/lib/mutations';
import { financeKeys, money } from '@/features/finance/api';
import { pricesApi, useFactoryPrices } from '@/features/finance/prices-api';

const validPrice = (v: string) => v.trim() !== '' && Number(v) >= 0 && Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 1e-6;

/**
 * The CEO: a factory's own prices for the clearer settlement items. Every item is
 * there, at the default price until changed; new settlements take these prices.
 */
export function FactoryPricesDrawer({ factory, onClose }: { factory: { id: number; name: string } | null; onClose: () => void }) {
  const { data, error, isLoading } = useFactoryPrices(factory?.id ?? null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [problem, setProblem] = useState('');
  const save = useAction(
    () =>
      pricesApi.updateFactoryPrices(
        factory!.id,
        (data?.items ?? [])
          .filter((i) => Number(values[i.id]) !== Number(i.price))
          .map((i) => ({ settlementItemId: i.id, price: Number(values[i.id]) })),
      ),
    { success: 'اتحفظت أسعار المصنع', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!data) return;
    save.reset();
    setProblem('');
    setValues(Object.fromEntries(data.items.map((i) => [i.id, String(Number(i.price))])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the factory's prices load
  }, [data]);

  const changed = (data?.items ?? []).filter((i) => Number(values[i.id]) !== Number(i.price));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((data?.items ?? []).some((i) => !validPrice(values[i.id] ?? ''))) return setProblem('اكتب سعر صحيح لكل بند (صفر أو أكتر)');
    if (changed.length === 0) return onClose();
    setProblem('');
    save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Drawer
      open={!!factory}
      onClose={onClose}
      width="max-w-2xl"
      title={`أسعار بنود التصفية · ${factory?.name ?? ''}`}
      subtitle="بنود تصفية عهدة المستخلص بسعر المصنع ده. التصفيات الجاية بتاخد الأسعار دي."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="factory-prices" type="submit" loading={save.isPending}>
            حفظ{changed.length ? ` (${changed.length})` : ''}
          </Button>
        </div>
      }
    >
      {error ? <ErrorBox error={error} /> : null}
      {isLoading && <div className="h-40 rounded-2xl shimmer" />}
      {data && (
        <form id="factory-prices" noValidate onSubmit={submit} className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">البند</th>
                  <th className="px-3 py-2 text-start font-medium">السعر الافتراضي</th>
                  <th className="w-40 px-3 py-2 text-start font-medium">سعر المصنع</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => {
                  const differs = Number(values[i.id]) !== Number(i.defaultPrice);
                  return (
                    <tr key={i.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{i.name}</div>
                        <div className="flex gap-1.5">
                          {i.perContainer && <Badge tone="muted">للحاوية</Badge>}
                          {!i.isActive && <Badge tone="muted">موقوف</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted" dir="ltr" style={{ textAlign: 'right' }}>
                        {money(i.defaultPrice, 'EGP')}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          dir="ltr"
                          aria-label={`سعر ${i.name} للمصنع`}
                          value={values[i.id] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))}
                          className={`focus-ring h-10 w-full rounded-lg border bg-surface px-3 ${differs ? 'border-gold text-gold' : 'border-line'}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">السعر الذهبي مختلف عن الافتراضي. البند الجديد في القوائم الثابتة بيتضاف هنا بسعره الافتراضي.</p>
          {problem && <p className="text-sm text-danger">{problem}</p>}
          {save.error ? <ErrorBox error={save.error} /> : null}
        </form>
      )}
    </Drawer>
  );
}
