import { describe, expect, it } from 'vitest';
import { formatAddress, formatAddressLines } from './address';

describe('formatAddressLines', () => {
  it('renders street, region and country lines', () => {
    expect(formatAddressLines({
      street: ['Örnek Mh. Deneme Cd. No: 1', 'Kat: 2 D: 3'],
      city: 'Ankara',
      state: { code: '06', name: 'Ankara' },
      zip_code: '06000',
      country: { code: 'TR', name: 'Türkiye' }
    })).toEqual([
      'Örnek Mh. Deneme Cd. No: 1',
      'Kat: 2 D: 3',
      'Ankara, Ankara 06000',
      'Türkiye'
    ]);
  });

  it('prefers the state name over the code', () => {
    expect(formatAddressLines({
      city: 'Los Angeles',
      state: { code: 'CA', name: 'California' },
      zip_code: '90001'
    })).toEqual(['Los Angeles, California 90001']);
  });

  it('falls back to the state code when there is no name', () => {
    expect(formatAddressLines({
      city: 'Los Angeles',
      state: { code: 'CA' },
      zip_code: '90001'
    })).toEqual(['Los Angeles, CA 90001']);
  });

  it('accepts plain string state and country', () => {
    expect(formatAddressLines({
      city: 'Berlin',
      state: 'Berlin',
      zip_code: '10115',
      country: 'Germany'
    })).toEqual(['Berlin, Berlin 10115', 'Germany']);
  });

  it('accepts a single street string', () => {
    expect(formatAddressLines({ street: '1 Main St', city: 'Springfield' }))
      .toEqual(['1 Main St', 'Springfield']);
  });

  it('collapses empty parts without leaving separators', () => {
    expect(formatAddressLines({ city: 'Paris' })).toEqual(['Paris']);
    expect(formatAddressLines({ state: { name: 'Île-de-France' } })).toEqual(['Île-de-France']);
    expect(formatAddressLines({ zip_code: '75001' })).toEqual(['75001']);
    expect(formatAddressLines({ street: ['', '  '], city: '' })).toEqual([]);
  });

  it('returns an empty array for missing input', () => {
    expect(formatAddressLines()).toEqual([]);
    expect(formatAddressLines(null)).toEqual([]);
  });
});

describe('formatAddress', () => {
  it('joins lines with newlines by default', () => {
    expect(formatAddress({
      street: ['1 Main St'],
      city: 'Springfield',
      state: { code: 'IL', name: 'Illinois' },
      zip_code: '62701',
      country: { code: 'US', name: 'United States' }
    })).toBe('1 Main St\nSpringfield, Illinois 62701\nUnited States');
  });

  it('joins lines with a custom separator', () => {
    expect(formatAddress({ city: 'Springfield', country: 'United States' }, ', '))
      .toBe('Springfield, United States');
  });

  it('returns an empty string for missing input', () => {
    expect(formatAddress(null)).toBe('');
  });
});
