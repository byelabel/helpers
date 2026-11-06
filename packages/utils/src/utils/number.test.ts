import { describe, expect, it } from 'vitest';
import { currency, currencySymbol, format, formatBytes, getRandom, percent, short, toCm, toGr, toIn, toKg, toNumber, toOz, toLb, type WeightUnit } from './number';

const converters = { lb: toLb, oz: toOz, kg: toKg, gr: toGr };

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
  it('toLb converts from each unit at full precision', () => {
    expect(toLb(2, 'lb')).toBe(2);
    expect(toLb(1, 'kg')).toBe(2.20462262184878);
    expect(toLb(16, 'oz')).toBe(1);
    expect(toLb(453.59237, 'gr')).toBe(1);
  });

  it('toOz converts from each unit at full precision', () => {
    expect(toOz(3, 'oz')).toBe(3);
    expect(toOz(1, 'lb')).toBe(16);
    expect(toOz(1, 'kg')).toBe(35.2739619495804);
    expect(toOz(28.349523125, 'gr')).toBe(1);
  });

  it('toKg converts from each unit at full precision', () => {
    expect(toKg(1.5, 'kg')).toBe(1.5);
    expect(toKg(1, 'lb')).toBe(0.45359237);
    expect(toKg(16, 'oz')).toBe(0.45359237);
    expect(toKg(500, 'gr')).toBe(0.5);
  });

  it('toGr converts from each unit at full precision', () => {
    expect(toGr(250, 'gr')).toBe(250);
    expect(toGr(1, 'lb')).toBe(453.59237);
    expect(toGr(1, 'oz')).toBe(28.349523125);
    expect(toGr(0.5, 'kg')).toBe(500);
  });

  it('removes floating point noise', () => {
    expect(toKg(0.1 + 0.2, 'kg')).toBe(0.3);
    expect(toGr(1.1, 'kg')).toBe(1100);
  });

  it('falls back to 0 for missing or non-numeric values', () => {
    expect(toLb(undefined as any, 'kg')).toBe(0);
    expect(toOz('abc' as any, 'lb')).toBe(0);
    expect(toKg(null as any, 'lb')).toBe(0);
    expect(toGr(NaN, 'kg')).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(toLb('1' as any, 'kg')).toBe(2.20462262184878);
    expect(toGr('0.5' as any, 'kg')).toBe(500);
  });

  it('rounds only when a precision is given', () => {
    expect(toKg(1, 'lb', { precision: 3 })).toBe(0.454);
    expect(toLb(1, 'kg', { precision: 2 })).toBe(2.2);
    expect(toGr(1, 'oz', { precision: 1 })).toBe(28.3);
  });

  it('supports floor and ceil rounding', () => {
    expect(toKg(1, 'lb', { precision: 3, rounding: 'floor' })).toBe(0.453);
    expect(toKg(1, 'lb', { precision: 3, rounding: 'ceil' })).toBe(0.454);
    expect(toKg(2, 'kg', { precision: 3, rounding: 'floor' })).toBe(2);
    // 0.29 * 100 is 28.999999999999996 in binary floating point
    expect(toLb(0.29, 'lb', { precision: 2, rounding: 'floor' })).toBe(0.29);
    expect(toLb(0.29, 'lb', { precision: 2, rounding: 'ceil' })).toBe(0.29);
  });

  it('round-trips exactly between every pair of units', () => {
    const units: WeightUnit[] = ['lb', 'oz', 'kg', 'gr'];

    const failures: string[] = [];

    for (let i = 1; i <= 20000; i++) {
      const value = i / 1000; // 0.001 … 20

      for (const from of units) {
        for (const to of units) {
          const back = converters[from](converters[to](value, from), to);

          if (back !== value) failures.push(`${value} ${from} → ${to} → ${back}`);
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('a floored value never converts back above the original', () => {
    const failures: number[] = [];

    for (let i = 1; i <= 100000; i++) {
      const lb = i / 1000;
      const kg = toKg(lb, 'lb', { precision: 3, rounding: 'floor' });

      if (kg / 0.45359237 > lb) failures.push(lb);
    }

    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('keeps the old 1 lb = 1 lb behaviour that carriers bill on', () => {
    // 1 lb used to go out as 0.454 kg = 1.000899 lb, which carriers rounding up billed as 2 lb
    expect(Math.ceil(toKg(1, 'lb') / 0.45359237)).toBe(1);
  });
});

describe('length conversions', () => {
  it('converts at full precision and round-trips', () => {
    expect(toCm(1, 'in')).toBe(2.54);
    expect(toIn(2.54, 'cm')).toBe(1);
    expect(toIn(1, 'cm')).toBe(0.393700787401575);
    expect(toCm(5, 'cm')).toBe(5);

    const failures: number[] = [];

    for (let i = 1; i <= 100000; i++) {
      const value = i / 100;

      if (toIn(toCm(value, 'in'), 'cm') !== value || toCm(toIn(value, 'cm'), 'in') !== value) failures.push(value);
    }

    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('rounds only when a precision is given', () => {
    expect(toCm(1, 'in', { precision: 1 })).toBe(2.5);
    expect(toIn(1, 'cm', { precision: 2, rounding: 'ceil' })).toBe(0.4);
  });
});

describe('dimension conversions', () => {
  it('toIn converts cm and passes through inches', () => {
    expect(toIn(2.54, 'cm')).toBe(1);
    expect(toIn(5, 'in')).toBe(5);
  });

  it('toCm converts inches and passes through cm', () => {
    expect(toCm(1, 'in')).toBe(2.54);
    expect(toCm(10, 'cm')).toBe(10);
  });

  it('falls back to 0 for zero or non-numeric values', () => {
    expect(toIn(0, 'in')).toBe(0);
    expect(toIn(undefined as any, 'cm')).toBe(0);
    expect(toCm('abc' as any, 'in')).toBe(0);
    expect(toCm(0, 'cm')).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(toIn('2.54' as any, 'cm')).toBe(1);
    expect(toCm('2' as any, 'in')).toBe(5.08);
  });
});
