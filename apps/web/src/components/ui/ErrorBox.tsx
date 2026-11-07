import { AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { errorMessages } from '@/lib/api-error';

/** Shows every message of a failed request (the API can return several at once). */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const messages = errorMessages(error);
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }}
      transition={{ duration: 0.4 }}
      className="flex gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {messages.length === 1 ? (
        <p>{messages[0]}</p>
      ) : (
        <ul className="list-inside list-disc space-y-1">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
