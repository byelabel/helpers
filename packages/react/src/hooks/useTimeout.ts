import { useEffect, useRef } from 'react';
import useIsomorphicLayoutEffect from './useIsomorphicLayoutEffect';

export default function useTimeout(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useIsomorphicLayoutEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof delay !== 'number') return;

    const id = setTimeout(() => savedCallback.current(), delay);

    return () => clearTimeout(id);
  }, [delay]);
}
