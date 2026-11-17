import { changedFields, show, type Data } from './format';

export function Changes({ before, after }: { before: Data; after: Data }) {
  const rows = changedFields(before, after);
  if (!rows.length) return <p className="text-sm text-muted">لا توجد تفاصيل إضافية</p>;
  const both = !!before && !!after;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">الحقل</th>
            {before && <th className="px-3 py-2 font-medium">{both ? 'قبل' : 'القيمة'}</th>}
            {after && <th className="px-3 py-2 font-medium">{both ? 'بعد' : 'القيمة'}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="px-3 py-2 font-semibold">{r.label}</td>
              {before && <td className={`px-3 py-2 break-words ${both ? 'text-danger/90 line-through decoration-danger/40' : ''}`} dir="auto">{show(r.before)}</td>}
              {after && <td className={`px-3 py-2 break-words ${both ? 'text-success' : ''}`} dir="auto">{show(r.after)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
