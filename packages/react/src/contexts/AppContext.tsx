import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type AppContextValue<T> = {
  state: T;
  setState: (next: T) => void;
};

const AppContext = createContext<AppContextValue<any> | null>(null);

export function AppProvider<T>({ initial, children }: { initial: T; children: ReactNode }) {
  const [state, setState] = useState<T>(initial);
  const value = useMemo(() => ({ state, setState }), [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext<T>(): AppContextValue<T> {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside <AppProvider>');
  return ctx as AppContextValue<T>;
}
