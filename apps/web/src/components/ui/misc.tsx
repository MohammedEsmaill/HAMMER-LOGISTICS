import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_TONES = {
  gold: 'bg-gold/12 text-gold border-gold/30',
  success: 'bg-success/12 text-success border-success/30',
  danger: 'bg-danger/12 text-danger border-danger/30',
  muted: 'bg-surface-2 text-muted border-line',
} as const;

export function Badge({
  tone = 'muted',
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** An on/off switch; in RTL the knob travels right to left. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-gold' : 'bg-line'}`}
    >
      <motion.span
        className="absolute top-0.5 size-5 rounded-full bg-white shadow"
        animate={{ right: checked ? 2 : 22 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

/** Icon button for row actions (edit, delete…), with its name for screen readers. */
export function IconButton({
  label,
  onClick,
  children,
  tone = 'muted',
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: 'muted' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={`focus-ring rounded-lg p-2 transition-colors ${tone === 'danger' ? 'text-muted hover:bg-danger/10 hover:text-danger' : 'text-muted hover:bg-gold/10 hover:text-gold'}`}
    >
      {children}
    </button>
  );
}
