import { motion } from 'motion/react';
import type { ReactNode } from 'react';
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
  if (error) return <ErrorBox error={error} />;

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
