import { Eye, EyeOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
  /** Dates are today at the latest; only expected dates (an ETA) may be later. */
  allowFuture?: boolean;
}

/** Today (or now) on this computer, as a date / datetime-local input takes it. */
function nowFor(type: string) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return type === 'datetime-local' ? d.toISOString().slice(0, 16) : d.toISOString().slice(0, 10);
}

/** Labelled input; the error appears under it and is announced to screen readers. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, icon, hint, allowFuture, type = 'text', className = '', ...props },
  ref,
) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-muted">
        {label}
      </label>
      <div
        className={`group flex h-12 items-center gap-2 rounded-xl border bg-surface-2 px-3 transition-colors focus-within:border-gold ${
          error ? 'border-danger' : 'border-line'
        }`}
      >
        {icon && <span className="text-muted group-focus-within:text-gold">{icon}</span>}
        <input
          ref={ref}
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-full w-full bg-transparent text-ink outline-none placeholder:text-muted/60"
          max={(type === 'date' || type === 'datetime-local') && !allowFuture ? nowFor(type) : undefined}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="focus-ring rounded-md p-1 text-muted hover:text-ink"
            aria-label={revealed ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-1.5 text-sm text-danger"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
