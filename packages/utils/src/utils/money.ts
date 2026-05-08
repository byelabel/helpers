import { isNumeric } from './validator';

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function getCurrencyDecimals(code = 'USD'): number {
  const upper = code.toUpperCase();

  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(upper)) return 3;

  return 2;
}

export function isZeroDecimalCurrency(code: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(code.toUpperCase());
}

export function toMinor(amount: number | string, code = 'USD'): number {
  if (!isNumeric(amount)) amount = 0;

  const factor = Math.pow(10, getCurrencyDecimals(code));

  return Math.round(Number(amount) * factor);
}

export function toMajor(minor: number | string, code = 'USD'): number {
  if (!isNumeric(minor)) minor = 0;

  const decimals = getCurrencyDecimals(code);
  const factor = Math.pow(10, decimals);

  return Number((Number(minor) / factor).toFixed(decimals));
}

export interface MoneyFormatOptions {
  code?: string;
  locale?: string;
  minor?: boolean;
  decimals?: boolean;
  symbol?: boolean;
}

export function format(amount: number | string, options: MoneyFormatOptions = {}): string {
  const { code = 'USD', locale, minor = false, decimals = true, symbol = true } = options;

  if (!isNumeric(amount)) amount = 0;

  const value = minor ? toMajor(amount, code) : Number(amount);
  const currencyDecimals = getCurrencyDecimals(code);
  const fractionDigits = decimals ? currencyDecimals : 0;

  return new Intl.NumberFormat(locale || 'en-US', {
    style: symbol ? 'currency' : 'decimal',
    currency: code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}
