import { Check, ChevronDown, ListFilter } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';

interface MultiSelectProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
  className?: string;
}

/**
 * "Filter by": a dropdown of check boxes, any number at once; nothing checked = all.
 * Sits beside a search box.
 */
export function MultiSelect<T extends string>({ label, options, value, onChange, className = '' }: MultiSelectProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary =
    value.length === 0
      ? 'الكل'
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label
        : `${value.length} مختارين`;

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => setOpen((o) => !o)}
        className={`focus-ring flex h-12 w-full items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
          value.length ? 'border-gold bg-gold/10 text-gold' : 'border-line bg-surface text-ink hover:border-gold/50'
        }`}
      >
        <ListFilter className="size-4 shrink-0" />
        <span className="shrink-0 text-muted">{label}:</span>
        <span className="flex-1 truncate text-start font-semibold">{summary}</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={`${id}-list`}
            role="listbox"
            aria-multiselectable
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 mt-2 w-full min-w-56 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-xl"
          >
            {options.map((o) => {
              const on = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm hover:bg-gold/10"
                >
                  <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${on ? 'border-gold gold-fill' : 'border-line'}`}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-xl border-t border-line px-3 py-2 text-start text-sm text-muted hover:text-ink">
                مسح الاختيار
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
