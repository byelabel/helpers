import { SyntheticEvent, useState } from 'react';

export type UseTabsResult<T = number | string> = {
  currentTab: T;
  setCurrentTab: (value: T) => void;
  onChangeTab: (e: SyntheticEvent, newValue: T) => void;
};

export default function useTabs<T = number | string>(defaultTab: T): UseTabsResult<T> {
  const [currentTab, setCurrentTab] = useState<T>(defaultTab ?? (0 as unknown as T));

  return {
    currentTab,
    setCurrentTab,
    onChangeTab: (_e, newValue) => {
      setCurrentTab(newValue);
    }
  };
}
