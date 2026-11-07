import { Check, ChevronDown, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Option } from './SelectField';

interface ComboFieldProps {
  label: string;
  options: Option[];
  value: string | number | undefined | null;
  onChange: (value: number | string | '') => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Shown when nothing matches. */
  empty?: string;
  /** For server-side search: called with what the user types. */
  onQueryChange?: (query: string) => void;
}

const MAX_SHOWN = 80;

/** A select with type-to-search, for long lists (countries, ports, clients). */
export function ComboField({
  label,
  options,
  value,
  onChange,
  onBlur,
  error,
  placeholder = 'اختار...',
  disabled,
  className = '',
  empty = 'مفيش نتايج',
  onQueryChange,
}: ComboFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => String(o.value) === String(value ?? ''));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return found.slice(0, MAX_SHOWN);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onBlur]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (o: Option) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery('');
    onBlur?.();
  };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActive(Math.max(0, matches.findIndex((o) => o.value === selected?.value)));
    requestAnimationFrame(() => input.current?.focus());
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-muted">
        {label}
      </label>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openList();
          }
        }}
        className={`flex h-12 w-full items-center gap-2 rounded-xl border bg-surface-2 ps-3 pe-3 text-start outline-none focus:border-gold disabled:opacity-60 ${error ? 'border-danger' : open ? 'border-gold' : 'border-line'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? 'text-ink' : 'text-muted'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 text-muted" />
              <input
                ref={input}
                value={query}
                aria-label={`بحث في ${label}`}
                aria-controls={`${id}-list`}
                placeholder="اكتب للبحث..."
                className="h-11 w-full bg-transparent outline-none placeholder:text-muted/60"
                onChange={(e) => {
                  setQuery(e.target.value);
                  onQueryChange?.(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, matches.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (matches[active]) pick(matches[active]);
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    setOpen(false);
                  } else if (e.key === 'Tab') {
                    setOpen(false);
                  }
                }}
              />
            </div>
            <ul ref={list} id={`${id}-list`} role="listbox" className="max-h-64 overflow-y-auto p-1">
              {matches.length === 0 && <li className="px-3 py-3 text-sm text-muted">{empty}</li>}
              {matches.map((o, i) => {
                const isSelected = o.value === selected?.value;
                return (
                  <li
                    key={o.value}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o)}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-gold/10 text-gold' : ''} ${o.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <span className="flex-1">{o.label}</span>
                    {isSelected && <Check className="size-4 text-gold" />}
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
