import { useRef } from 'react';

export default function useIsInit(): boolean {
  const isInit = useRef(true);

  if (isInit.current) {
    isInit.current = false;
    return true;
  }

  return isInit.current;
}
