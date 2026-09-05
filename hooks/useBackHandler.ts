import { useEffect, useRef } from 'react';
import { pushBackHandler } from '../services/back';

/**
 * Takes the Android back gesture while `active`, so an open sheet closes
 * itself instead of the screen behind it. The handler is read through a ref,
 * so a fresh closure every render does not re-order the stack.
 */
export const useBackHandler = (active: boolean, onBack: () => void) => {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => latest.current());
  }, [active]);
};
