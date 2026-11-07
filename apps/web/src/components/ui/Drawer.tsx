import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

/**
 * A side panel for forms. In RTL it slides in from the left (the reading end), so
 * the list it was opened from stays visible on the right.
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'max-w-xl',
}: DrawerProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // callers pass inline handlers; a ref keeps the effect from re-running each render
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // focus the first field once the panel is in place
    const t = setTimeout(() => {
      panel.current
        ?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')
        ?.focus();
    }, 250);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`absolute inset-y-0 left-0 flex w-full ${width} flex-col border-e border-line bg-surface shadow-2xl`}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
          >
            <header className="flex items-start gap-3 border-b border-line p-5">
              <div className="flex-1">
                <h2 id={titleId} className="text-lg font-bold">
                  {title}
                </h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button
                data-close
                onClick={onClose}
                className="focus-ring rounded-lg p-1.5 text-muted hover:text-ink"
                aria-label="إغلاق"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
            {footer && <footer className="border-t border-line p-4">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
