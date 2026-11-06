import { useEffect } from 'react';

export default function Toast({ message, onDismiss, duration = 3000 }: { message: string; onDismiss: () => void; duration?: number }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  return <div className="toast-message" role="status" aria-live="polite">{message}</div>;
}
