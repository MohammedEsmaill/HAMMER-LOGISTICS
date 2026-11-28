import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { IconButton } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { api } from '@/lib/api-client';
import { toastError } from '@/lib/mutations';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../finance/api';
import { useExpenseTypes } from '../finance/office-api';

interface Item {
  id: number;
  name: string;
  category: ExpenseCategory | null;
}

/**
 * The general expense items: a fixed list under the main items. The accountant picks
 * from it; the CEO and the moderator add and rename.
 */
export function ExpenseItemsTab() {
  const { can } = useAuth();
  const manage = can('lookups.manage');
  const queryClient = useQueryClient();
  const { data: items = [] } = useExpenseTypes();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (item: Item | 'new') => {
    setEditing(item);
    setName(item === 'new' ? '' : item.name);
    setCategory(item === 'new' ? '' : (item.category ?? ''));
    setProblem('');
  };
  const save = async () => {
    if (name.trim().length < 2) return setProblem('اكتب اسم البند');
    if (!category) return setProblem('اختار البند الرئيسي');
    setBusy(true);
    try {
      if (editing === 'new') await api.post('/finance/expenses/types', { name: name.trim(), category });
      else if (editing) await api.patch(`/finance/expenses/types/${editing.id}`, { name: name.trim(), category });
      await queryClient.invalidateQueries({ queryKey: ['finance', 'expense-types'] });
      setEditing(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const groups = (Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => ({
    category: c,
    items: items.filter((i) => i.category === c).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
  }));

  return (
    <div className="space-y-4">
      {manage && (
        <div className="flex justify-end">
          <Button icon={<Plus className="size-4" />} onClick={() => open('new')}>
            بند جديد
          </Button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g.category} className="card p-4">
            <div className="mb-2 font-bold text-gold">{EXPENSE_CATEGORIES[g.category]}</div>
            <div className="space-y-1">
              {g.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                  {i.name}
                  {manage && (
                    <IconButton label={`تعديل ${i.name}`} onClick={() => open(i)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                  )}
                </div>
              ))}
              {g.items.length === 0 && <div className="text-sm text-muted">—</div>}
            </div>
          </div>
        ))}
      </div>
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'بند مصروف جديد' : 'تعديل بند'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={save}>
              حفظ
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="البند الرئيسي"
            placeholder="اختار"
            options={Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => ({ value, label }))}
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          />
          <TextField label="اسم البند" value={name} onChange={(e) => setName(e.target.value)} />
          {problem && <p className="text-sm text-danger">{problem}</p>}
        </div>
      </Drawer>
    </div>
  );
}
