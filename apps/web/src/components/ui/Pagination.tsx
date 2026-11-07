import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return null;
  const btn =
    'focus-ring grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted">
      <span>
        {total} نتيجة · صفحة {page} من {pages}
      </span>
      <div className="flex gap-1.5">
        <button className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="الصفحة السابقة">
          <ChevronRight className="size-4" />
        </button>
        <button className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="الصفحة التالية">
          <ChevronLeft className="size-4" />
        </button>
      </div>
    </div>
  );
}
