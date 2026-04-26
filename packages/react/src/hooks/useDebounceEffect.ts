import { DependencyList, useEffect } from 'react';

export default function useDebounceEffect(
  fn: (...args: any[]) => void,
  waitTime: number,
  deps: DependencyList
): void {
  useEffect(() => {
    const id = setTimeout(() => {
      fn.apply(undefined, deps as any[]);
    }, waitTime);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
