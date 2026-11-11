import { Inbox, type LucideIcon } from 'lucide-react';

/** "Nothing here": an icon and a short sentence, the same everywhere a list is empty. */
export function EmptyState({ text, icon: Icon = Inbox, compact }: { text: string; icon?: LucideIcon; compact?: boolean }) {
  return (
    <div className={`grid place-items-center gap-3 text-center text-muted ${compact ? 'py-5' : 'py-10'}`}>
      <span className={`grid place-items-center rounded-2xl bg-gold/10 text-gold ${compact ? 'size-10' : 'size-14'}`}>
        <Icon className={compact ? 'size-5' : 'size-7'} strokeWidth={1.6} />
      </span>
      <p className="text-sm">{text}</p>
    </div>
  );
}
