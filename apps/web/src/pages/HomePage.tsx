import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { NAV } from '@/layout/nav';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 18) return 'مساء الخير';
  return 'مساء النور';
}

export default function HomePage() {
  const { user, canAny } = useAuth();
  const shortcuts = NAV.filter((n) => n.to !== '/' && canAny(...n.any));

  return (
    <div className="space-y-8">
      <motion.div
        className="card relative overflow-hidden p-6 sm:p-8"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-gold/15 blur-3xl" />
        <p className="text-muted">{greeting()}</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
          {user?.name}، <span className="gold-text">أهلًا بيك في HAMMER LINE</span>
        </h2>
        <p className="mt-2 text-muted">دورك: {user?.role.name}</p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map(({ to, label, icon: Icon }, i) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            whileHover={{ y: -3 }}
          >
            <Link
              to={to}
              className="card focus-ring group flex items-center gap-4 p-5 transition-colors hover:border-gold/50"
            >
              <span className="grid size-12 place-items-center rounded-xl bg-gold/10 text-gold">
                <Icon className="size-6" />
              </span>
              <span className="flex-1 font-semibold">{label}</span>
              <ArrowLeft className="size-5 text-muted transition-transform group-hover:-translate-x-1 group-hover:text-gold" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
