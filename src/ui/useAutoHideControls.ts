import { useEffect, useState } from 'react';

// Activity extends visibility, but never reveals hidden controls.
export function useAutoHideControls(enabled: boolean, resetKey?: unknown) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled || !visible) return;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 4000);
    };
    const activityEvents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focusin'] as const;
    activityEvents.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [enabled, visible, resetKey]);

  return [visible, setVisible] as const;
}
