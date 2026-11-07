import { motion } from 'motion/react';
import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <motion.div
          className="gold-text text-8xl font-bold"
          dir="ltr"
          initial={{ opacity: 0, rotateX: 80 }}
          animate={{ opacity: 1, rotateX: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        >
          404
        </motion.div>
        <p className="mt-3 text-lg font-semibold">الصفحة دي مش موجودة</p>
        <p className="text-muted">ممكن الرابط اتغير أو اتكتب غلط.</p>
        <Link to="/" className="mt-5 inline-block font-semibold text-gold hover:underline">
          الرجوع للرئيسية
        </Link>
      </div>
    </div>
  );
}
