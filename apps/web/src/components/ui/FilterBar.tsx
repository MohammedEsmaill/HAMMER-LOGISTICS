import { SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useIsPhone } from '@/lib/use-media';
import { Button } from './Button';

/**
 * A list's filters. On a wide screen they sit in one row; on a phone the search stays
 * in view and the other filters open from a "فلاتر" button in a sheet from the bottom.
 * `active` is how many filters are set, shown on that button.
 */
export function FilterBar({
  search,
  children,
  active = 0,
  className = 'mb-4',
}: {
  search?: ReactNode;
  children?: ReactNode;
  active?: number;
  className?: string;
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);

  if (!phone) {
    return (
      <div className={`flex flex-wrap items-end gap-3 ${className}`}>
        {search && <div className="min-w-60 flex-1">{search}</div>}
        {children}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {search && <div className="min-w-0 flex-1">{search}</div>}
      {children && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`focus-ring flex h-12 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm ${
            active ? 'border-gold/40 bg-gold/10 text-gold' : 'border-line text-muted'
          } ${search ? '' : 'w-full justify-center'}`}
        >
          <SlidersHorizontal className="size-4" />
          فلاتر
          {active > 0 && <span className="gold-fill grid size-5 place-items-center rounded-full text-[11px] font-bold">{active}</span>}
        </button>
      )}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-label="الفلاتر"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-5 pb-8"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">الفلاتر</h3>
                <button type="button" className="focus-ring rounded-lg p-2 text-muted" onClick={() => setOpen(false)} aria-label="إغلاق">
                  <X className="size-5" />
                </button>
              </div>
              {/* every filter takes the full width of the sheet */}
              <div className="flex flex-col gap-4 [&>*]:!w-full">{children}</div>
              <Button className="mt-6 w-full" onClick={() => setOpen(false)}>
                عرض النتايج
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
