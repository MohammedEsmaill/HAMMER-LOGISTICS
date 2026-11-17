import { useQuery } from '@tanstack/react-query';
import { Clock, Compass, Container, CornerDownLeft, FileText, Landmark, Search, Wallet, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { NAV } from '@/layout/nav';
import { api } from '@/lib/api-client';

type Group = 'pages' | 'shipments' | 'invoices' | 'custodies' | 'clients' | 'recent';

interface Hit {
  group: Group;
  title: string;
  subtitle: string;
  link: string;
}

const GROUPS: Record<Group, { label: string; icon: LucideIcon }> = {
  recent: { label: 'فتحتها مؤخرًا', icon: Clock },
  pages: { label: 'الصفحات', icon: Compass },
  shipments: { label: 'الشحنات', icon: Container },
  invoices: { label: 'الفواتير', icon: FileText },
  custodies: { label: 'العهد', icon: Wallet },
  clients: { label: 'حسابات العملاء', icon: Landmark },
};

const RECENT_KEY = 'hl.search.recent';

function readRecent(): Hit[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Hit[];
  } catch {
    return [];
  }
}

function remember(hit: Hit) {
  try {
    const list = [hit, ...readRecent().filter((h) => h.link !== hit.link)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // private window: no memory, still works
  }
}

/** Arabic-insensitive enough for page names: ignores hamza forms and ta marbuta. */
const fold = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The quick search, from anywhere with Ctrl+K (or the search icon): shipments by any
 * number or client, invoices, custodies, client accounts and the system's pages. Each
 * user finds only what they may see. Arrows to move, Enter to open, Esc to close.
 */
export function QuickSearch() {
  const navigate = useNavigate();
  const { canAny } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const q = useDebounced(text.trim(), 250);

  // Ctrl+K / ⌘K opens it from anywhere
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    if (open) {
      setText('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  const { data: found = [], isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<Hit[]>('/search', { q }),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
  });

  const pages = useMemo<Hit[]>(() => {
    const items = NAV.filter((n) => n.to !== '/' && (!n.any.length || canAny(...n.any))).map((n) => ({
      group: 'pages' as const,
      title: n.label,
      subtitle: '',
      link: n.to,
    }));
    if (canAny('shipments.create')) items.unshift({ group: 'pages', title: 'شحنة جديدة', subtitle: 'تسجيل شحنة', link: '/shipments/new' });
    return items;
  }, [canAny]);

  const hits = useMemo<Hit[]>(() => {
    const t = fold(text.trim());
    if (!t) return readRecent().map((h) => ({ ...h, group: 'recent' as const }));
    const pageHits = pages.filter((p) => fold(p.title).includes(t)).slice(0, 5);
    return [...pageHits, ...(q === text.trim() ? found : [])];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recent is read when the box opens or clears
  }, [text, pages, found, q, open]);

  useEffect(() => setActive(0), [hits.length, text]);

  const go = (hit: Hit) => {
    remember(hit);
    setOpen(false);
    navigate(hit.link);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // group headings in the order the hits come
  let last: Group | null = null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="focus-ring flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-muted hover:border-gold/60 hover:text-gold"
        aria-label="بحث سريع (Ctrl+K)"
        title="بحث سريع (Ctrl+K)"
      >
        <Search className="size-4" />
        <span className="hidden md:inline">بحث</span>
        <kbd className="hidden rounded border border-line px-1.5 text-[10px] md:inline" dir="ltr">
          Ctrl K
        </kbd>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
            >
              <motion.div
                initial={{ y: -10, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: -10, scale: 0.98 }}
                className="card w-full max-w-xl overflow-hidden p-0 shadow-2xl"
                role="dialog"
                aria-label="بحث سريع"
              >
                <div className="flex items-center gap-3 border-b border-line px-4">
                  <Search className={`size-5 ${isFetching ? 'animate-pulse text-gold' : 'text-muted'}`} />
                  <input
                    ref={input}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="رقم ملف، بوليصة، حاوية، ACID، رقم 46، فاتورة، عهدة، عميل أو صفحة"
                    className="h-14 flex-1 bg-transparent text-base outline-none"
                    aria-label="ابحث"
                  />
                  <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">Esc</kbd>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-2">
                  {hits.map((h, i) => {
                    const heading = h.group !== last;
                    last = h.group;
                    const Icon = GROUPS[h.group].icon;
                    return (
                      <div key={`${h.group}-${h.link}-${i}`}>
                        {heading && <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gold">{GROUPS[h.group].label}</div>}
                        <button
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(h)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start ${i === active ? 'bg-gold/12' : ''}`}
                        >
                          <Icon className="size-4 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold" dir="auto">
                              {h.title}
                            </span>
                            {h.subtitle && <span className="block truncate text-xs text-muted">{h.subtitle}</span>}
                          </span>
                          {i === active && <CornerDownLeft className="size-4 text-gold" />}
                        </button>
                      </div>
                    );
                  })}
                  {!hits.length && (
                    <p className="p-6 text-center text-sm text-muted">
                      {text.trim().length < 2 ? 'اكتب حرفين على الأقل' : isFetching || q !== text.trim() ? 'جارٍ البحث...' : 'لا توجد نتائج'}
                    </p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
