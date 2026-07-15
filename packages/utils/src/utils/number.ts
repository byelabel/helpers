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

export function toPounds(weight: { unit: 'lb' | 'kg', value: number }): number {
  return weight?.unit === 'kg' ? toNumber(weight.value * 2.20462, 2) : toNumber(weight?.value || 0, 2);
}

export function toInches(value: number, unit: 'in' | 'cm'): number {
  return unit === 'cm' ? toNumber((value || 1) / 2.54, 2) : toNumber(value || 1, 2);
}

export function toKg(weight: { unit: 'lb' | 'kg', value: number }): number {
  return weight?.unit === 'lb' ? toNumber(weight.value * 0.453592, 3) : toNumber(weight?.value || 0, 3);
}

export function toCm(value: number, unit: 'in' | 'cm'): number {
  return unit === 'in' ? toNumber((value || 1) * 2.54, 1) : toNumber(value || 1, 1);
}
