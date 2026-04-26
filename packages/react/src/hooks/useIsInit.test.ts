import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useIsInit from './useIsInit';

describe('useIsInit', () => {
  it('returns true on first render and false thereafter', () => {
    const { result, rerender } = renderHook(() => useIsInit());

    expect(result.current).toBe(true);

    rerender();
    expect(result.current).toBe(false);

    rerender();
    expect(result.current).toBe(false);
  });
});
