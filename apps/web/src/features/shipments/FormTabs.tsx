import { motion } from 'motion/react';

/** Animated tab strip; a red dot marks tabs that hold errors. */
export function FormTabs<K extends string>({
  tabs,
  active,
  onChange,
  errorTabs,
  layoutId,
}: {
  tabs: { key: K; label: string; count?: number }[];
  active: K;
  onChange: (key: K) => void;
  errorTabs?: Set<string | undefined>;
  layoutId: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className="focus-ring relative shrink-0 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          {active === t.key && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-gold/12 ring-1 ring-gold/30" />}
          <span className={`relative flex items-center gap-2 ${active === t.key ? 'text-gold' : 'text-muted'}`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-gold/15 px-1.5 text-xs text-gold">{t.count}</span>}
            {errorTabs?.has(t.key) && <span className="size-2 rounded-full bg-danger" aria-label="فيه أخطاء" />}
          </span>
        </button>
      ))}
    </div>
  );
}
