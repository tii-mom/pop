import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface AlertMessage {
  type: 'ok' | 'err';
  text: string;
}

interface InlineAlertProps {
  alert: AlertMessage | null;
  onDismiss?: () => void;
}

export function InlineAlert({ alert, onDismiss }: InlineAlertProps) {
  return (
    <AnimatePresence initial={false}>
      {alert && (
        <motion.div
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div
            role="status"
            className={`flex items-start justify-between gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
              alert.type === 'ok'
                ? 'border-pop-lime/30 bg-pop-lime/10 text-pop-lime'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            <span>{alert.text}</span>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="关闭提示"
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
