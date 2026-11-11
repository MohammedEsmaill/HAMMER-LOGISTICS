import { motion } from 'motion/react';

/** Animated tab strip; a red count marks tabs that hold errors. */
export function FormTabs<K extends string>({
  tabs,
  active,
  onChange,
  errorCounts,
  layoutId,
}: {
  tabs: { key: K; label: string; count?: number }[];
  active: K;
  onChange: (key: K) => void;
  errorCounts?: Map<string, number>;
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
            {!!errorCounts?.get(t.key) && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white" aria-label={`${errorCounts.get(t.key)} خانة محتاجة تتصلح`}>
                {errorCounts.get(t.key)}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
