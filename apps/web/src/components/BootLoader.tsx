import { motion } from 'motion/react';
import { lazy, Suspense } from 'react';

const GoldScene = lazy(() => import('./three/GoldScene'));

const WORDS = ['تسجيل', 'متابعة', 'تخليص', 'تسليم'];

/**
 * The intro while the session is restored: containers circling in gold, the logo
 * rising into place, and the four steps of the trade cycling under it.
 * Always dark, whatever the theme: it is the brand's own stage.
 */
export function BootLoader() {
  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-[#0b0b0d]"
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      role="status"
      aria-label="جاري تجهيز النظام"
    >
      <Suspense fallback={null}>
        <div className="absolute inset-0">
          <GoldScene mode="loader" />
        </div>
      </Suspense>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,#0b0b0dcc_0%,transparent_32%,#0b0b0d_80%)]" />

      <div className="relative flex h-full flex-col items-center justify-center gap-6 text-center">
        <motion.img
          src="/logo-mark.png"
          alt=""
          className="w-24 drop-shadow-[0_0_30px_rgba(212,167,60,0.55)] sm:w-28"
          initial={{ opacity: 0, y: 24, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
        <motion.div
          initial={{ opacity: 0, letterSpacing: '0.6em' }}
          animate={{ opacity: 1, letterSpacing: '0.18em' }}
          transition={{ delay: 0.25, duration: 1.1, ease: 'easeOut' }}
          dir="ltr"
          className="gold-text text-2xl font-bold sm:text-3xl"
        >
          HAMMER LINE
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          dir="ltr"
          className="text-xs tracking-[0.35em] text-[#9b968a]"
        >
          SHIPPING &amp; LOGISTICS
        </motion.p>

        <div className="mt-4 flex h-6 items-center gap-2 text-sm text-[#d8cfb8]" aria-hidden>
          {WORDS.map((word, i) => (
            <motion.span
              key={word}
              initial={{ opacity: 0.15 }}
              animate={{ opacity: [0.15, 1, 0.15] }}
              transition={{ delay: 0.8 + i * 0.35, duration: 1.4, repeat: Infinity, repeatDelay: 0.7 }}
            >
              {word}
              {i < WORDS.length - 1 && <span className="ms-2 text-[#d4a73c]">◆</span>}
            </motion.span>
          ))}
        </div>

        <div className="mt-2 h-[3px] w-48 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full w-1/2 rounded-full bg-gradient-to-l from-[#f1d27a] to-[#a8791f]"
            animate={{ x: ['-110%', '210%'] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
