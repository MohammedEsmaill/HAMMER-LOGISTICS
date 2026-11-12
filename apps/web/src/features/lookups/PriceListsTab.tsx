import { Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, Switch } from '@/components/ui/misc';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/mutations';
import { financeKeys, money } from '../finance/api';
import { pricesApi, REGIMES, usePrices, type FeeRate, type SettlementItem } from '../finance/prices-api';

export type PriceTab = 'fee-rates' | 'settlement-items';

const validMoney = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0;

function FeeRateDrawer({ rate, onClose }: { rate: FeeRate | null; onClose: () => void }) {
  const [first, setFirst] = useState('');
  const [extra, setExtra] = useState('');
  const [problem, setProblem] = useState('');
  const save = useAction(() => pricesApi.updateFeeRate(rate!.regime, { firstContainer: Number(first), extraContainer: Number(extra) }), {
    success: 'اتحفظت الأسعار',
    invalidate: [financeKeys.all],
  });
  useEffect(() => {
    if (!rate) return;
    setFirst(String(Number(rate.firstContainer)));
    setExtra(String(Number(rate.extraContainer)));
    setProblem('');
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when it opens
  }, [rate]);
  const submit = () => {
    if (!validMoney(first) || !validMoney(extra)) return setProblem('اكتب مبالغ صحيحة أكبر من صفر');
    setProblem('');
    save.mutateAsync(undefined).then(onClose, () => undefined);
  };
  return (
    <Drawer
      open={!!rate}
      onClose={onClose}
      title={rate ? `أتعاب المستخلص · ${REGIMES[rate.regime]}` : ''}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            حفظ
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField label="مصاريف تخليص حاوية 20 / 40" type="number" step="0.01" min="0.01" dir="ltr" value={first} onChange={(e) => setFirst(e.target.value)} />
        <TextField label="مصاريف الحاوية الزيادة" type="number" step="0.01" min="0.01" dir="ltr" value={extra} onChange={(e) => setExtra(e.target.value)} />
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </div>
    </Drawer>
  );
}

function ItemDrawer({ item, open, onClose }: { item: SettlementItem | null; open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [perContainer, setPerContainer] = useState(false);
  const [active, setActive] = useState(true);
  const [problem, setProblem] = useState('');
  const save = useAction(
    () =>
      item
        ? pricesApi.updateItem(item.id, { name: name.trim(), price: Number(price), perContainer, isActive: active })
        : pricesApi.createItem({ name: name.trim(), price: Number(price), perContainer }),
    { success: item ? 'اتحفظ البند' : 'اتضاف البند', invalidate: [financeKeys.all] },
  );
  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setPrice(item ? String(Number(item.price)) : '');
    setPerContainer(item?.perContainer ?? false);
    setActive(item?.isActive ?? true);
    setProblem('');
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when it opens
  }, [open, item]);
  const submit = () => {
    if (name.trim().length < 2) return setProblem('اكتب اسم البند');
    if (!validMoney(price)) return setProblem('اكتب سعر صحيح أكبر من صفر');
    setProblem('');
    save.mutateAsync(undefined).then(onClose, () => undefined);
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={item ? `تعديل ${item.name}` : 'بند تصفية جديد'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            حفظ
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField label="البند" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="السعر" type="number" step="0.01" min="0.01" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />
        <label className="flex items-center justify-between rounded-xl border border-line p-3">
          <span className="font-semibold">السعر للحاوية</span>
          <Switch checked={perContainer} onChange={setPerContainer} label="السعر للحاوية" />
        </label>
        {item && (
          <label className="flex items-center justify-between rounded-xl border border-line p-3">
            <span className="font-semibold">البند شغال</span>
            <Switch checked={active} onChange={setActive} label="البند شغال" />
          </label>
        )}
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </div>
    </Drawer>
  );
}

/** The price lists in the lookups screen: everyone with access reads them, the CEO sets them. */
export function PriceListsTab({ tab }: { tab: PriceTab }) {
  const { can } = useAuth();
  const manage = can('finance.prices.manage');
  const { data, isLoading, error } = usePrices();
  const [rate, setRate] = useState<FeeRate | null>(null);
  const [item, setItem] = useState<SettlementItem | null>(null);
  const [itemOpen, setItemOpen] = useState(false);

  if (tab === 'fee-rates') {
    const columns: Column<FeeRate>[] = [
      { header: 'النظام الجمركي', cell: (r) => <span className="font-semibold">{REGIMES[r.regime]}</span> },
      { header: 'مصاريف تخليص حاوية 20 / 40', cell: (r) => <b dir="ltr">{money(r.firstContainer, 'EGP')}</b> },
      { header: 'مصاريف الحاوية الزيادة', cell: (r) => <b dir="ltr">{money(r.extraContainer, 'EGP')}</b> },
      ...(manage
        ? [
            {
              header: '',
              className: 'w-0',
              cell: (r: FeeRate) => (
                <IconButton label={`تعديل ${REGIMES[r.regime]}`} onClick={() => setRate(r)}>
                  <Pencil className="size-4" />
                </IconButton>
              ),
            },
          ]
        : []),
    ];
    return (
      <div className="space-y-3">
        <h3 className="font-bold">وارد بحري · ميناء الإسكندرية والدخيلة</h3>
        <DataTable columns={columns} rows={data?.feeRates} rowKey={(r) => r.regime} loading={isLoading} error={error} />
        <FeeRateDrawer rate={rate} onClose={() => setRate(null)} />
      </div>
    );
  }

  const columns: Column<SettlementItem>[] = [
    { header: 'م', className: 'w-0', cell: (i) => i.sortOrder },
    { header: 'البند', cell: (i) => <span className="font-semibold">{i.name}</span> },
    {
      header: 'السعر',
      cell: (i) => (
        <span>
          <b dir="ltr">{money(i.price, 'EGP')}</b>
          {i.perContainer && <span className="ms-2 text-xs text-muted">للحاوية</span>}
        </span>
      ),
    },
    { header: 'الحالة', cell: (i) => <Badge tone={i.isActive ? 'success' : 'muted'}>{i.isActive ? 'شغال' : 'موقوف'}</Badge> },
    ...(manage
      ? [
          {
            header: '',
            className: 'w-0',
            cell: (i: SettlementItem) => (
              <IconButton
                label={`تعديل ${i.name}`}
                onClick={() => {
                  setItem(i);
                  setItemOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </IconButton>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">بنود تصفية عهدة المستخلص</h3>
        {manage && (
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setItem(null);
              setItemOpen(true);
            }}
          >
            بند جديد
          </Button>
        )}
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(i) => i.id} loading={isLoading} error={error} />
      <ItemDrawer item={item} open={itemOpen} onClose={() => setItemOpen(false)} />
    </div>
  );
}
