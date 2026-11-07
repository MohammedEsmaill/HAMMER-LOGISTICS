import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, useState } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Spinner } from '@/components/ui/Spinner';
import { useTheme } from '@/lib/use-theme';
import { NAV } from './nav';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { canAny } = useAuth();
  const items = NAV.filter((item) => item.any.length === 0 || canAny(...item.any));

  return (
    <nav className="flex h-full flex-col gap-1 p-4" aria-label="القائمة الرئيسية">
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
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className="focus-ring relative flex h-11 items-center gap-3 rounded-xl px-3 text-muted transition-colors hover:text-ink"
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
              <Icon className={`relative size-5 ${isActive ? 'text-gold' : ''}`} />
              <span className={`relative ${isActive ? 'font-semibold text-ink' : ''}`}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
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
