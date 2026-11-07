import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'gold-fill shadow-[0_8px_24px_-10px_var(--gold-2)] hover:brightness-110',
  ghost: 'border border-line bg-surface-2 text-ink hover:border-gold/60',
  danger: 'bg-danger/90 text-white hover:bg-danger',
};

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-[filter,border-color,background-color] disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </motion.button>
  );
}
