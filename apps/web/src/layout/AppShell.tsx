import { ChevronDown, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, useState } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Spinner } from '@/components/ui/Spinner';
import { useTheme } from '@/lib/use-theme';
import { NAV, NAV_GROUPS, type NavGroup, type NavItem } from './nav';

const COLLAPSED_KEY = 'hl.sidebar.collapsed';

function readCollapsed(): NavGroup[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as NavGroup[];
  } catch {
    return [];
  }
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { to, label, icon: Icon } = item;
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className="focus-ring relative flex h-10 items-center gap-3 rounded-xl px-3 text-muted transition-colors hover:text-ink"
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-xl border border-gold/30 bg-gold/10"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <Icon className={`relative size-[18px] shrink-0 ${isActive ? 'text-gold' : ''}`} />
          <span className={`relative truncate text-[15px] ${isActive ? 'font-semibold text-ink' : ''}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

/** Home on top, then the sections; a section with nothing for this user does not show. */
function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { canAny } = useAuth();
  const location = useLocation();
  const items = NAV.filter((item) => item.any.length === 0 || canAny(...item.any));
  const [collapsed, setCollapsed] = useState<NavGroup[]>(readCollapsed);
  const toggle = (group: NavGroup) => {
    const next = collapsed.includes(group) ? collapsed.filter((g) => g !== group) : [...collapsed, group];
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      // a private window keeps it for this visit only
    }
  };

  return (
    <nav className="flex h-full flex-col overflow-y-auto p-4" aria-label="القائمة الرئيسية">
      <div className="mb-6 flex items-center gap-3 px-2">
        <img src="/logo-mark.png" alt="" className="w-10" />
        <div dir="ltr" className="text-start leading-tight">
          <div className="gold-text text-sm font-bold tracking-widest whitespace-nowrap">
            HAMMER LINE
          </div>
          <div className="text-[9px] tracking-[0.14em] whitespace-nowrap text-muted">
            SHIPPING &amp; LOGISTICS
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {items
          .filter((i) => !i.group)
          .map((item) => (
            <SidebarLink key={item.to} item={item} onNavigate={onNavigate} />
          ))}
      </div>
      {NAV_GROUPS.map((group) => {
        const list = items.filter((i) => i.group === group.key);
        if (list.length === 0) return null;
        const holdsCurrent = list.some((i) => location.pathname.startsWith(i.to));
        // the section of the open page stays open
        const open = holdsCurrent || !collapsed.includes(group.key);
        return (
          <div key={group.key} className="mt-4">
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={open}
              className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide text-muted/80 hover:text-ink"
            >
              <span className="flex-1 text-start">{group.label}</span>
              <ChevronDown className={`size-4 transition-transform ${open ? '' : 'rotate-90'}`} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-1 overflow-hidden pt-1"
                >
                  {list.map((item) => (
                    <SidebarLink key={item.to} item={item} onNavigate={onNavigate} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}

function PageFallback() {
  return (
    <div className="grid h-64 place-items-center text-gold">
      <Spinner className="size-8" />
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const outlet = useOutlet();
  const [drawer, setDrawer] = useState(false);
  const current = NAV.find((n) =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
  );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-e border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 right-0 z-50 w-72 border-s border-line bg-surface lg:hidden"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <button
                className="focus-ring absolute top-4 left-4 rounded-lg p-2 text-muted"
                onClick={() => setDrawer(false)}
                aria-label="إغلاق القائمة"
              >
                <X className="size-5" />
              </button>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md sm:px-6">
          <button
            className="focus-ring rounded-lg p-2 text-muted lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="text-lg font-semibold">{current?.label ?? ''}</h1>
          <div className="ms-auto flex items-center gap-2">
            <button
              onClick={toggle}
              className="focus-ring rounded-xl p-2.5 text-muted hover:text-gold"
              aria-label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <div className="hidden text-end sm:block">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-muted">{user?.role.name}</div>
            </div>
            <div className="gold-fill grid size-9 place-items-center rounded-full text-sm font-bold">
              {user?.name.trim().charAt(0)}
            </div>
            <button
              onClick={() => void logout()}
              className="focus-ring rounded-xl p-2.5 text-muted hover:text-danger"
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
            >
              <LogOut className="size-5 -scale-x-100" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
