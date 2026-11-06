/// <reference lib="es2020.bigint" />
import { isNumeric } from './validator';

export function toNumber(number: number | string, scale = 2): number {
  if (!isNumeric(number)) number = 0;

  return Number(Number(number).toFixed(scale));
}

export interface NumberFormatOptions {
  locale?: string;
  decimals?: number;
  grouping?: boolean;
}

export function format(number: number | string, options: NumberFormatOptions = {}): string {
  const { locale, decimals, grouping = true } = options;

  if (!isNumeric(number)) number = 0;

  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'decimal',
    useGrouping: grouping,
    ...(decimals !== undefined && {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }).format(Number(number));
}

export interface CurrencyFormatOptions {
  locale?: string;
  decimals?: boolean;
  symbol?: boolean;
}

export function currency(number: number | string, code = 'USD', options: CurrencyFormatOptions = {}): string {
  const { locale, decimals = true, symbol = true } = options;

  if (!isNumeric(number)) number = 0;

  const naturalDigits = new Intl.NumberFormat(locale || 'en-US', {
    style: 'currency',
    currency: code
  }).resolvedOptions().minimumFractionDigits ?? 2;

  const fractionDigits = decimals ? naturalDigits : 0;

  return new Intl.NumberFormat(locale || 'en-US', {
    style: symbol ? 'currency' : 'decimal',
    currency: code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(Number(number));
}

export interface CurrencySymbolOptions {
  locale?: string;
}

export function currencySymbol(code = 'USD', options: CurrencySymbolOptions = {}): string | undefined {
  const { locale } = options;

  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'currency',
    currency: code
  }).formatToParts(0).find(part => part?.type === 'currency')?.value;
}

export interface PercentFormatOptions {
  locale?: string;
  decimals?: number;
}

export function percent(number: number | string, options: PercentFormatOptions = {}): string {
  const { locale, decimals } = options;

  if (!isNumeric(number)) number = 0;

  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'percent',
    ...(decimals !== undefined
      ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      : { maximumSignificantDigits: 2 })
  }).format(Number(number) / 100);
}

export interface ShortFormatOptions {
  locale?: string;
  decimals?: number;
  long?: boolean;
}

export function short(number: number | string, options: ShortFormatOptions = {}): string {
  const { locale, decimals = 1, long = false } = options;

  if (!isNumeric(number)) number = 0;

  return new Intl.NumberFormat(locale || 'en-US', {
    notation: 'compact',
    compactDisplay: long ? 'long' : 'short',
    maximumFractionDigits: decimals
  }).format(Number(number));
}

export function getRandom(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function formatBytes(bytes: number): string {
  const units: string[] = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  let i = -1;

  do {
    bytes = bytes / 1024;
    i++;
  } while (bytes > 1024);

  return `${Math.max(bytes, 0.1).toFixed(1)} ${units[i]}`;
}

// ── Unit conversion ──────────────────────────────────────────────────────────────────────────────
//
// Exact definitions: 1 lb = 0.45359237 kg (international pound), 1 oz = 1/16 lb, 1 in = 2.54 cm.
//
// Conversions are done in exact rational arithmetic (BigInt), not in binary floating point, and
// the result is the SHORTEST decimal (≤ 15 significant digits) within 1e-14 of the exact value.
// That makes every conversion reversible: for any input with up to 13 significant digits,
// toLb(toKg(x, 'lb'), 'kg') === x, and likewise for every pair of units. Rounding is opt-in
// (`precision` / `rounding`) and should only happen where a value leaves the system.

export type WeightUnit = 'lb' | 'oz' | 'kg' | 'gr';
export type LengthUnit = 'in' | 'cm';
export type RoundingMode = 'round' | 'floor' | 'ceil';

export interface ConvertOptions {
  /** Decimal places to round to. Omitted = full precision. */
  precision?: number;
  /** How to round when `precision` is set. Default `'round'` (half up). Use `'floor'` for a value
   * sent to a system that rounds up (carriers), so converting it back never exceeds the original. */
  rounding?: RoundingMode;
}

// A non-negative-denominator fraction num / den.
interface Rational { num: bigint; den: bigint }

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

const POWERS: bigint[] = [ONE];

function pow10(n: number): bigint {
  while (POWERS.length <= n) POWERS.push(POWERS[POWERS.length - 1] * TEN);

  return POWERS[n];
}
const abs = (n: bigint): bigint => (n < ZERO ? -n : n);

function rational(decimal: string): Rational {
  // '0.45359237', '1e-7', '-2.5E+3' — whatever String(number) produces
  const match = /^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(decimal.trim());

  if (!match) return { num: ZERO, den: ONE };

  const [, sign, int = '', frac = '', exp = '0'] = match;
  const shift = Number(exp) - frac.length;
  const digits = BigInt(`${sign}${int}${frac}` || '0');

  return shift >= 0 ? { num: digits * pow10(shift), den: ONE } : { num: digits, den: pow10(-shift) };
}

// Grams / centimetres per unit, as exact fractions.
const WEIGHT_FACTORS: Record<WeightUnit, Rational> = {
  lb: rational('453.59237'),
  oz: rational('28.349523125'),
  kg: rational('1000'),
  gr: rational('1')
};

const LENGTH_FACTORS: Record<LengthUnit, Rational> = {
  in: rational('2.54'),
  cm: rational('1')
};

// num / den divided to an integer with the given rounding (den > 0).
function divide(num: bigint, den: bigint, rounding: RoundingMode): bigint {
  const quotient = num / den; // truncates toward zero
  const remainder = num % den;

  if (remainder === ZERO) return quotient;

  if (rounding === 'floor') return num < ZERO ? quotient - ONE : quotient;
  if (rounding === 'ceil') return num < ZERO ? quotient : quotient + ONE;

  // half up (toward +∞), like Math.round
  const twice = abs(remainder) * TWO;

  if (num < ZERO) return twice > den ? quotient - ONE : quotient;

  return twice >= den ? quotient + ONE : quotient;
}

// value rounded to `scale` decimal places → number (via a decimal string, so no float arithmetic).
function toDecimal(value: Rational, scale: number, rounding: RoundingMode): number {
  const scaled = scale >= 0
    ? divide(value.num * pow10(scale), value.den, rounding)
    : divide(value.num, value.den * pow10(-scale), rounding) * pow10(-scale);

  return Number(scale > 0 ? `${scaled}e-${scale}` : `${scaled}`);
}

// Number of digits before the decimal point of |value| (≤ 0 below 1): 123.4 → 3, 0.5 → 0, 0.05 → -1.
// i.e. the e with 10^(e-1) <= |value| < 10^e.
function magnitude(value: Rational): number {
  const num = abs(value.num);
  const below = (e: number): boolean => (e >= 0 ? num < value.den * pow10(e) : num * pow10(-e) < value.den);
  let exponent = num.toString().length - value.den.toString().length; // off by at most one

  while (!below(exponent)) exponent++;
  while (below(exponent - 1)) exponent--;

  return exponent;
}

// Shortest decimal (1–15 significant digits) whose distance to the exact value is within
// 1e-14 of the larger of the two. Always found by 15 digits (max error 5e-15).
const TOLERANCE = pow10(14);

function shortest(value: Rational): number {
  if (value.num === ZERO) return 0;

  const digitsBeforePoint = magnitude(value);

  for (let digits = 1; digits <= 15; digits++) {
    const scale = digits - digitsBeforePoint;
    const candidate = scale >= 0
      ? { num: divide(value.num * pow10(scale), value.den, 'round'), den: pow10(scale) }
      : { num: divide(value.num, value.den * pow10(-scale), 'round') * pow10(-scale), den: ONE };

    // |c - v| * 1e14 <= max(|c|, |v|), both scaled to the common denominator
    const c = candidate.num * value.den;
    const v = value.num * candidate.den;
    const larger = abs(c) > abs(v) ? abs(c) : abs(v);

    if (abs(c - v) * TOLERANCE <= larger) {
      return toDecimal(candidate, scale, 'round');
    }
  }

  return toDecimal(value, 15 - digitsBeforePoint, 'round');
}

function convert<T extends string>(value: number, from: T, to: T, factors: Record<T, Rational>, options: ConvertOptions = {}): number {
  value = isNumeric(value) ? Number(value) : 0;

  if (!value || !Number.isFinite(value)) return 0;

  const source = rational(String(value));
  const toFactor = factors[to];
  const fromFactor = factors[from] ?? toFactor;

  // value * from / to, exact
  let num = source.num * fromFactor.num * toFactor.den;
  let den = source.den * fromFactor.den * toFactor.num;

  if (den < ZERO) {
    num = -num;
    den = -den;
  }

  const result = { num, den };
  const { precision, rounding = 'round' } = options;

  return precision === undefined ? shortest(result) : toDecimal(result, precision, rounding);
}

export function toLb(value: number, unit: WeightUnit, options?: ConvertOptions): number {
  return convert(value, unit, 'lb', WEIGHT_FACTORS, options);
}

export function toOz(value: number, unit: WeightUnit, options?: ConvertOptions): number {
  return convert(value, unit, 'oz', WEIGHT_FACTORS, options);
}

export function toKg(value: number, unit: WeightUnit, options?: ConvertOptions): number {
  return convert(value, unit, 'kg', WEIGHT_FACTORS, options);
}

export function toGr(value: number, unit: WeightUnit, options?: ConvertOptions): number {
  return convert(value, unit, 'gr', WEIGHT_FACTORS, options);
}

export function toIn(value: number, unit: LengthUnit, options?: ConvertOptions): number {
  return convert(value, unit, 'in', LENGTH_FACTORS, options);
}

export function toCm(value: number, unit: LengthUnit, options?: ConvertOptions): number {
  return convert(value, unit, 'cm', LENGTH_FACTORS, options);
}
