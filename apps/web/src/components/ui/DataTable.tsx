import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useIsPhone } from '@/lib/use-media';
import { EmptyState } from './EmptyState';
import { ErrorBox } from './ErrorBox';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: unknown;
  empty?: string;
  onRowClick?: (row: T) => void;
}

/** A list with a shimmering skeleton while loading, an empty state, and the API's error. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  empty = 'مفيش بيانات لسه',
  onRowClick,
}: DataTableProps<T>) {
  const phone = useIsPhone();
  if (error) return <ErrorBox error={error} />;
  if (phone) return <CardList {...{ columns, rows, rowKey, loading, empty, onRowClick }} />;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-muted">
            {columns.map((c) => (
              <th key={c.header} className={`px-4 py-3 text-start font-medium ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }, (_, i) => (
              <tr key={i} className="border-b border-line/60">
                {columns.map((c) => (
                  <td key={c.header} className="px-4 py-4">
                    <div className="h-3.5 w-3/4 rounded bg-surface-2">
                      <div className="shimmer h-full w-full rounded" />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows?.map((row, i) => (
              <motion.tr
                key={rowKey(row)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.025 }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-gold/5' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.header} className={`px-4 py-3 ${c.className ?? ''}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
        </tbody>
      </table>
      {!loading && rows?.length === 0 && (
        <EmptyState text={empty} />
      )}
    </div>
  );
}

/**
 * The same rows as cards, for a phone: the first column heads each card, the rest
 * follow as label and value, and a column with no label (buttons) closes the card.
 */
function CardList<T>({ columns, rows, rowKey, loading, empty, onRowClick }: Omit<DataTableProps<T>, 'error'> & { empty: string }) {
  const [head, ...rest] = columns.filter((c) => c.header !== 'اختيار');
  const pick = columns.find((c) => c.header === 'اختيار');
  const fields = rest.filter((c) => c.header);
  const actions = rest.filter((c) => !c.header);
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-28 shimmer" />
        ))}
      </div>
    );
  }
  if (!rows?.length) {
    return (
      <div className="card">
        <EmptyState text={empty} />
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((row, i) => (
        <motion.li
          key={rowKey(row)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 12) * 0.025 }}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={`card space-y-3 p-4 ${onRowClick ? 'cursor-pointer active:bg-gold/5' : ''}`}
        >
          <div className="flex items-start gap-3">
            {pick && <div onClick={(e) => e.stopPropagation()}>{pick.cell(row)}</div>}
            <div className="min-w-0 flex-1">{head?.cell(row)}</div>
          </div>
          {fields.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {fields.map((c) => {
                const value = c.cell(row);
                // an empty cell (say, no "in" on an "out" line) takes no room on a card
                if (value === '' || value === null || value === undefined || value === false) return null;
                return (
                  <div key={c.header} className="min-w-0">
                    <dt className="text-xs text-muted">{c.header}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                );
              })}
            </dl>
          )}
          {actions.map((c, j) => (
            <div key={j} className="border-t border-line/60 pt-3" onClick={(e) => e.stopPropagation()}>
              {c.cell(row)}
            </div>
          ))}
        </motion.li>
      ))}
    </ul>
  );
}
