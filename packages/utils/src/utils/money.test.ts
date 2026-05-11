import { describe, expect, it } from 'vitest';
import { display, getCurrencyDecimals, isZeroDecimalCurrency, toMajor, toMinor } from './money';

describe('getCurrencyDecimals', () => {
  it('returns 2 for USD by default', () => {
    expect(getCurrencyDecimals()).toBe(2);
    expect(getCurrencyDecimals('USD')).toBe(2);
    expect(getCurrencyDecimals('EUR')).toBe(2);
  });

  it('returns 0 for zero-decimal currencies', () => {
    expect(getCurrencyDecimals('JPY')).toBe(0);
    expect(getCurrencyDecimals('KRW')).toBe(0);
    expect(getCurrencyDecimals('VND')).toBe(0);
  });

  it('returns 3 for three-decimal currencies', () => {
    expect(getCurrencyDecimals('KWD')).toBe(3);
    expect(getCurrencyDecimals('BHD')).toBe(3);
    expect(getCurrencyDecimals('OMR')).toBe(3);
  });

  it('is case-insensitive', () => {
    expect(getCurrencyDecimals('jpy')).toBe(0);
    expect(getCurrencyDecimals('kwd')).toBe(3);
    expect(getCurrencyDecimals('usd')).toBe(2);
  });
});

describe('isZeroDecimalCurrency', () => {
  it('identifies zero-decimal currencies', () => {
    expect(isZeroDecimalCurrency('JPY')).toBe(true);
    expect(isZeroDecimalCurrency('KRW')).toBe(true);
  });

  it('returns false for decimal currencies', () => {
    expect(isZeroDecimalCurrency('USD')).toBe(false);
    expect(isZeroDecimalCurrency('EUR')).toBe(false);
    expect(isZeroDecimalCurrency('KWD')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isZeroDecimalCurrency('jpy')).toBe(true);
  });
});

describe('toMinor', () => {
  it('converts USD major to cents', () => {
    expect(toMinor(10.5)).toBe(1050);
    expect(toMinor('1.99')).toBe(199);
  });

  it('keeps zero-decimal currencies unscaled', () => {
    expect(toMinor(1500, 'JPY')).toBe(1500);
  });

  it('scales three-decimal currencies by 1000', () => {
    expect(toMinor(1.234, 'KWD')).toBe(1234);
  });

  it('rounds to nearest minor unit', () => {
    expect(toMinor(1.006)).toBe(101);
    expect(toMinor(1.004)).toBe(100);
  });

  it('coerces non-numeric input to 0', () => {
    expect(toMinor('abc' as any)).toBe(0);
    expect(toMinor(undefined as any)).toBe(0);
  });
});

describe('toMajor', () => {
  it('converts cents to USD major', () => {
    expect(toMajor(1050)).toBe(10.5);
    expect(toMajor('199')).toBe(1.99);
  });

  it('passes zero-decimal currencies through', () => {
    expect(toMajor(1500, 'JPY')).toBe(1500);
  });

  it('handles three-decimal currencies', () => {
    expect(toMajor(1234, 'KWD')).toBe(1.234);
  });

  it('coerces non-numeric input to 0', () => {
    expect(toMajor('abc' as any)).toBe(0);
  });
});

describe('display', () => {
  it('formats USD with currency symbol by default', () => {
    expect(display(1234.5)).toBe('$1,234.50');
  });

  it('formats zero-decimal currencies without decimals', () => {
    expect(display(1500, { currency: 'JPY' })).toBe('¥1,500');
  });

  it('formats three-decimal currencies with three fraction digits', () => {
    expect(display(1.234, { currency: 'KWD', locale: 'en-US' })).toBe('KWD 1.234');
  });

  it('treats input as minor units when minor=true', () => {
    expect(display(1050, { minor: true })).toBe('$10.50');
    expect(display(1500, { minor: true, currency: 'JPY' })).toBe('¥1,500');
  });

  it('omits decimals when decimals=false', () => {
    expect(display(10.5, { decimals: false })).toBe('$11');
  });

  it('omits symbol when symbol=false', () => {
    expect(display(10.5, { symbol: false })).toBe('10.50');
  });

  it('omits both when symbol=false and decimals=false', () => {
    expect(display(10.5, { symbol: false, decimals: false })).toBe('11');
  });

  it('honors locale override', () => {
    expect(display(1234.5, { currency: 'EUR', locale: 'de-DE' })).toBe('1.234,50 €');
  });

  it('coerces non-numeric input to 0', () => {
    expect(display('abc' as any)).toBe('$0.00');
  });
});
