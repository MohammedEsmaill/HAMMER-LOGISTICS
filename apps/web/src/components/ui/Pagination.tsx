import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PAGE_SIZES } from '@/lib/use-list-state';

/** The page numbers to show: the first, the last, and two each side of the current one. */
function pageItems(page: number, pages: number): (number | 'gap')[] {
  const wanted = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2]);
  const list = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Below every list: how many results, the page numbers with the first and last page,
 * and (when `onPageSizeChange` is given) how many rows a page shows.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const sizable = !!onPageSizeChange && total > PAGE_SIZES[0];
  if (pages === 1 && !sizable) return null;
  const base = 'focus-ring grid h-9 min-w-9 place-items-center rounded-lg border px-2 disabled:opacity-40';
  const btn = `${base} border-line bg-surface text-muted hover:text-ink`;
  const current = `${base} border-gold/50 bg-gold/15 font-semibold text-gold`;
  const go = (p: number) => {
    onChange(p);
    // the new page starts at the top: the window on a phone, the page column on a wide screen
    window.scrollTo({ top: 0 });
    for (let el = document.querySelector('main')?.parentElement; el; el = el.parentElement) {
      if (el.scrollTop > 0) el.scrollTo({ top: 0 });
    }
  };

  return (
    <nav aria-label="الصفحات" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          {total} نتيجة · صفحة {page} من {pages}
        </span>
        {sizable && (
          <label className="flex items-center gap-2">
            <span>عرض</span>
            <select
              className="focus-ring h-9 rounded-lg border border-line bg-surface px-2 text-ink"
              value={pageSize}
              onChange={(e) => onPageSizeChange!(Number(e.target.value))}
              aria-label="عدد الأسطر في الصفحة"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>في الصفحة</span>
          </label>
        )}
      </div>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={btn} disabled={page <= 1} onClick={() => go(1)} aria-label="الصفحة الأولى" title="الأولى">
            <ChevronsRight className="size-4" />
          </button>
          <button className={btn} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="الصفحة السابقة">
            <ChevronRight className="size-4" />
          </button>
          {pageItems(page, pages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap${i}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={p}
                className={p === page ? current : btn}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => go(p)}
              >
                {p}
              </button>
            ),
          )}
          <button className={btn} disabled={page >= pages} onClick={() => go(page + 1)} aria-label="الصفحة التالية">
            <ChevronLeft className="size-4" />
          </button>
          <button className={btn} disabled={page >= pages} onClick={() => go(pages)} aria-label="الصفحة الأخيرة" title="الأخيرة">
            <ChevronsLeft className="size-4" />
          </button>
        </div>
      )}
    </nav>
  );
}
