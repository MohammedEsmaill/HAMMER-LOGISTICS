import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Bell as BellIcon, CheckCheck, ClipboardCheck, Package, Ship } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { AR } from '@/lib/format';

type Kind = 'SHIPMENT_NEW' | 'SHIPMENT_ETA' | 'SHIPMENT_STUCK';

interface Inbox {
  unread: number;
  items: { id: number; kind: Kind; title: string; body: string; link: string; readAt: string | null; createdAt: string }[];
  waiting: { type: string; label: string; status: string; count: number }[];
}

const KEY = ['inbox'] as const;

const ICONS: Record<Kind, typeof Package> = { SHIPMENT_NEW: Package, SHIPMENT_ETA: Ship, SHIPMENT_STUCK: AlarmClock };

/** Whose step each status waits for, in words. */
const STEP: Record<string, string> = {
  PENDING: 'مستنية المراجعة',
  REVIEWED: 'مستنية الاعتماد',
  MANAGER_APPROVED: 'مستنية الاعتماد',
};

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'الآن';
  if (min < 60) return `منذ ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return new Intl.DateTimeFormat(AR, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** A short two-note chime, made on the spot (no sound file). */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // no sound on this browser
  }
}

/**
 * The bell in the header: shipment alerts for the operation team, and what waits for
 * the user's approval step. Checked every 30 seconds; something new shows a message
 * with a chime.
 */
export function Bell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api.get<Inbox>('/inbox'), refetchInterval: 30_000 });
  const seen = useRef<{ id: number; waiting: number } | null>(null);

  const waiting = data?.waiting.reduce((n, w) => n + w.count, 0) ?? 0;
  // one line per document type, with the steps it waits at
  const groups = Object.values(
    (data?.waiting ?? []).reduce<Record<string, { type: string; label: string; count: number; statuses: string[] }>>((acc, w) => {
      const g = (acc[w.type] ??= { type: w.type, label: w.label, count: 0, statuses: [] });
      g.count += w.count;
      g.statuses.push(w.status);
      return acc;
    }, {}),
  ).sort((a, b) => b.count - a.count);
  const badge = (data?.unread ?? 0) + waiting;

  // what arrived since the last check: a message and a chime (not on the first load)
  useEffect(() => {
    if (!data) return;
    const newest = data.items[0]?.id ?? 0;
    const before = seen.current;
    seen.current = { id: Math.max(newest, before?.id ?? 0), waiting };
    if (!before) return;
    const fresh = data.items.filter((i) => i.id > before.id && !i.readAt);
    const moreWaiting = waiting > before.waiting;
    if (!fresh.length && !moreWaiting) return;
    chime();
    if (fresh.length) {
      const first = fresh[0];
      toast(first.title, {
        description: fresh.length > 1 ? `و${fresh.length - 1} تنبيه تاني` : first.body,
        action: { label: 'فتح', onClick: () => navigate(first.link) },
      });
    }
    if (moreWaiting) {
      toast('معاملات جديدة مستنية دورك', {
        description: `${waiting} معاملة في انتظارك`,
        action: { label: 'فتح', onClick: () => navigate('/approvals') },
      });
    }
  }, [data, waiting, navigate]);

  // closes on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const go = (link: string, id?: number) => {
    setOpen(false);
    if (id) void api.post(`/inbox/${id}/read`).then(() => queryClient.invalidateQueries({ queryKey: KEY }));
    navigate(link);
  };
  const readAll = () => void api.post('/inbox/read-all').then(() => queryClient.invalidateQueries({ queryKey: KEY }));

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="focus-ring relative rounded-xl p-2.5 text-muted hover:text-gold"
        aria-label={badge ? `التنبيهات (${badge})` : 'التنبيهات'}
        aria-expanded={open}
      >
        <BellIcon className="size-5" />
        {badge > 0 && (
          <span className="absolute -top-0.5 -end-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="card absolute end-0 top-12 z-40 w-[min(92vw,380px)] overflow-hidden p-0 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="font-bold">التنبيهات</span>
              {(data?.unread ?? 0) > 0 && (
                <button onClick={readAll} className="flex items-center gap-1 text-xs text-gold hover:underline">
                  <CheckCheck className="size-4" /> تعليم الكل كمقروء
                </button>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {groups.length > 0 && (
                <div className="border-b border-line bg-gold/5 p-2">
                  <div className="px-2 pt-1 pb-2 text-xs font-semibold text-gold">مستنية دورك</div>
                  {groups.map((g) => (
                    <button
                      key={g.type}
                      onClick={() => go(`/approvals?type=${g.type}&status=${g.statuses.length === 1 ? g.statuses[0] : ''}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start hover:bg-surface-2"
                    >
                      <ClipboardCheck className="size-5 shrink-0 text-gold" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{g.label}</span>
                        <span className="block truncate text-xs text-muted">{g.statuses.map((st) => STEP[st] ?? st).join(' · ')}</span>
                      </span>
                      <span className="rounded-full bg-gold/15 px-2 text-sm font-bold text-gold">{g.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {data?.items.map((i) => {
                const Icon = ICONS[i.kind];
                return (
                  <button
                    key={i.id}
                    onClick={() => go(i.link, i.readAt ? undefined : i.id)}
                    className={`flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-start hover:bg-surface-2 ${i.readAt ? 'opacity-60' : ''}`}
                  >
                    <Icon className={`mt-0.5 size-5 shrink-0 ${i.kind === 'SHIPMENT_STUCK' ? 'text-danger' : 'text-gold'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{i.title}</span>
                      <span className="block text-xs text-muted">{i.body}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">{ago(i.createdAt)}</span>
                    </span>
                    {!i.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" />}
                  </button>
                );
              })}
              {data && !data.items.length && !groups.length && <p className="p-6 text-center text-sm text-muted">لا توجد تنبيهات</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
