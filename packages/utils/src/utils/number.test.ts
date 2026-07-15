import { describe, expect, it } from 'vitest';
import { currency, currencySymbol, format, formatBytes, getRandom, percent, short, toCm, toGr, toIn, toKg, toNumber, toOz, toLb } from './number';

describe('toNumber', () => {
  it('rounds to 2 decimals by default', () => {
    expect(toNumber(1.2345)).toBe(1.23);
  });

  it('respects custom scale', () => {
    expect(toNumber('1.236', 2)).toBe(1.24);
    expect(toNumber(1.2, 0)).toBe(1);
  });

  it('coerces non-numeric input to 0', () => {
    expect(toNumber('abc' as any)).toBe(0);
    expect(toNumber(undefined as any)).toBe(0);
    expect(toNumber(null as any)).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(toNumber('42')).toBe(42);
  });
});

describe('format', () => {
  it('formats numbers as decimal with grouping (en-US)', () => {
    expect(format(1234567.89)).toBe('1,234,567.89');
  });

  it('honors exact decimals', () => {
    expect(format(1.5, { decimals: 3 })).toBe('1.500');
  });

  it('disables grouping when grouping=false', () => {
    expect(format(1234567.89, { grouping: false })).toBe('1234567.89');
  });

  it('coerces non-numeric input to 0', () => {
    expect(format('abc' as any)).toBe('0');
  });

  it('honors locale override', () => {
    // tr-TR uses '.' as thousands separator and ',' as decimal
    expect(format(1234.5, { locale: 'tr-TR' })).toBe('1.234,5');
  });
});

describe('currency', () => {
  it('formats USD by default', () => {
    expect(currency(1234.5)).toBe('$1,234.50');
  });

  it('supports other currency codes', () => {
    expect(currency(10, 'EUR', { locale: 'en-US' })).toBe('€10.00');
  });

  it('omits decimals when decimals=false', () => {
    expect(currency(10.5, 'USD', { decimals: false })).toBe('$11');
  });

  it('omits symbol when symbol=false', () => {
    expect(currency(10.5, 'USD', { symbol: false })).toBe('10.50');
  });

  it('honors locale override', () => {
    expect(currency(1234.5, 'EUR', { locale: 'de-DE' })).toBe('1.234,50 €');
  });

  it('coerces non-numeric input to 0', () => {
    expect(currency('abc' as any)).toBe('$0.00');
  });
});

describe('currencySymbol', () => {
  it('returns the USD symbol by default', () => {
    expect(currencySymbol()).toBe('$');
  });

  it('returns the symbol for a given code', () => {
    expect(currencySymbol('EUR', { locale: 'en-US' })).toBe('€');
    expect(currencySymbol('GBP', { locale: 'en-US' })).toBe('£');
  });
});

describe('percent', () => {
  it('treats the input as a percentage value', () => {
    // 25 / 100 = 0.25 → "25%"
    expect(percent(25, { locale: 'en-US' })).toBe('25%');
  });

  it('honors exact decimals', () => {
    expect(percent(25.5, { locale: 'en-US', decimals: 2 })).toBe('25.50%');
  });

  it('coerces non-numeric input to 0', () => {
    expect(percent('abc' as any, { locale: 'en-US' })).toBe('0%');
  });
});

describe('short', () => {
  it('renders compact notation', () => {
    expect(short(1500)).toBe('1.5K');
    expect(short(2_500_000)).toBe('2.5M');
  });

  it('renders long compact notation when long=true', () => {
    expect(short(1500, { long: true })).toBe('1.5 thousand');
  });

  it('honors decimals', () => {
    expect(short(1234, { decimals: 2 })).toBe('1.23K');
  });

  it('coerces non-numeric input to 0', () => {
    expect(short('abc' as any)).toBe('0');
  });
});

describe('getRandom', () => {
  it('returns an integer within [min, max]', () => {
    for (let i = 0; i < 100; i++) {
      const n = getRandom(1, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it('returns the bound when min equals max', () => {
    expect(getRandom(7, 7)).toBe(7);
  });
});

describe('formatBytes', () => {
  it('formats kilobyte-range values', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('scales up to MB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('scales up to GB', () => {
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('clamps small values to a 0.1 floor', () => {
    expect(formatBytes(0)).toBe('0.1 KB');
  });
});
describe('weight conversions', () => {
  it('toLb converts from each unit', () => {
    expect(toLb({ unit: 'lb', value: 2 })).toBe(2);
    expect(toLb({ unit: 'kg', value: 1 })).toBe(2.2);
    expect(toLb({ unit: 'oz', value: 16 })).toBe(1);
    expect(toLb({ unit: 'gr', value: 453.59237 })).toBe(1);
  });

  it('toOz converts from each unit', () => {
    expect(toOz({ unit: 'oz', value: 3 })).toBe(3);
    expect(toOz({ unit: 'lb', value: 1 })).toBe(16);
    expect(toOz({ unit: 'kg', value: 1 })).toBe(35.27);
    expect(toOz({ unit: 'gr', value: 28.349523125 })).toBe(1);
  });

  it('toKg converts from each unit', () => {
    expect(toKg({ unit: 'kg', value: 1.5 })).toBe(1.5);
    expect(toKg({ unit: 'lb', value: 1 })).toBe(0.454);
    expect(toKg({ unit: 'oz', value: 16 })).toBe(0.454);
    expect(toKg({ unit: 'gr', value: 500 })).toBe(0.5);
  });

  it('toGr converts from each unit', () => {
    expect(toGr({ unit: 'gr', value: 250 })).toBe(250);
    expect(toGr({ unit: 'lb', value: 1 })).toBe(453.6);
    expect(toGr({ unit: 'oz', value: 1 })).toBe(28.3);
    expect(toGr({ unit: 'kg', value: 0.5 })).toBe(500);
  });

  it('falls back to 0 for missing or non-numeric values', () => {
    expect(toLb({ unit: 'kg', value: undefined as any })).toBe(0);
    expect(toOz({ unit: 'lb', value: 'abc' as any })).toBe(0);
    expect(toKg(null as any)).toBe(0);
    expect(toGr({ unit: 'kg', value: NaN })).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(toLb({ unit: 'kg', value: '1' as any })).toBe(2.2);
    expect(toGr({ unit: 'kg', value: '0.5' as any })).toBe(500);
  });
});

describe('dimension conversions', () => {
  it('toIn converts cm and passes through inches', () => {
    expect(toIn(2.54, 'cm')).toBe(1);
    expect(toIn(5, 'in')).toBe(5);
  });

  it('toCm converts inches and passes through cm', () => {
    expect(toCm(1, 'in')).toBe(2.5);
    expect(toCm(10, 'cm')).toBe(10);
  });

  it('falls back to 1 for zero or non-numeric values', () => {
    expect(toIn(0, 'in')).toBe(1);
    expect(toIn(undefined as any, 'cm')).toBe(0.39);
    expect(toCm('abc' as any, 'in')).toBe(2.5);
    expect(toCm(0, 'cm')).toBe(1);
  });

  it('accepts numeric strings', () => {
    expect(toIn('2.54' as any, 'cm')).toBe(1);
    expect(toCm('2' as any, 'in')).toBe(5.1);
  });
});
