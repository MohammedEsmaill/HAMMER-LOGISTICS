import { Hammer } from 'lucide-react';
import { motion } from 'motion/react';

/** Placeholder for the sections whose screens are being built next. */
export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="card grid place-items-center gap-3 p-12 text-center">
      <motion.span
        className="grid size-16 place-items-center rounded-2xl bg-gold/10 text-gold"
        animate={{ rotate: [0, -18, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.2 }}
      >
        <Hammer className="size-8" />
      </motion.span>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-muted">الشاشة دي بتتبني في الخطوة الجاية.</p>
    </div>
  );
}
