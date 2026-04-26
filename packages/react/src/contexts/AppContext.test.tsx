import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AppProvider, useAppContext } from './AppContext';

describe('AppContext', () => {
  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useAppContext<number>())).toThrow(/AppProvider/);
  });

  it('exposes initial state and updates via setState', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppProvider initial={{ count: 0 }}>{children}</AppProvider>
    );

    const { result } = renderHook(() => useAppContext<{ count: number }>(), { wrapper });

    expect(result.current.state).toEqual({ count: 0 });

    act(() => {
      result.current.setState({ count: 5 });
    });

    expect(result.current.state).toEqual({ count: 5 });
  });
});
