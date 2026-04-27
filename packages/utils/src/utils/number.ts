import { isNumeric } from './validator';

export function toNumber(number: number | string, scale = 2): number {
  if (!isNumeric(number)) number = 0;

  return Number(Number(number).toFixed(scale));
}

export function format(number: number | string, locale?: string, options?: Intl.NumberFormatOptions) {
  if (!isNumeric(number)) number = 0;

  return Intl.NumberFormat(locale || 'en-US', {
    style: 'decimal',
    ...options
  }).format(Number(number));
}

export function currency(number: number | string, code = 'USD', locale?: string) {
  if (!isNumeric(number)) number = 0;

  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'currency',
    currency: code
  }).format(Number(number));
}

export function currencySymbol(code = 'USD', locale?: string) {
  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'currency',
    currency: code
  }).formatToParts(0).find(part => part?.type === 'currency')?.value;
}

export function percent(number: number | string, locale?: string) {
  if (!isNumeric(number)) number = 0;

  const intl = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumSignificantDigits: 2
  });

  return intl.format(Number(number) / 100);
}

export function short(number: number | string, locale?: string) {
  if (!isNumeric(number)) number = 0;

  return Intl.NumberFormat(locale || 'en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1
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
