import { describe, expect, it } from 'vitest';
import { formatAddress, formatAddressLines, getAddressDifferences, isAddressConfirmed } from './address';

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

describe('getAddressDifferences', () => {
  const stored = {
    country_code: 'US',
    zip_code: '07606',
    state_code: 'NJ',
    city: 'South Hackensack',
    street: ['9528 25 Hwy'],
    residential: false
  };

  it('ignores case, spacing and a ZIP+4 extension', () => {
    expect(getAddressDifferences(stored, {
      ...stored,
      zip_code: '07606-1723',
      city: 'SOUTH  HACKENSACK',
      street: ['9528 25 hwy']
    })).toEqual([]);

    expect(getAddressDifferences({ ...stored, country_code: 'CA', zip_code: 'N4G 4T6' }, { ...stored, country_code: 'CA', zip_code: 'N4G4T6' })).toEqual([]);
  });

  it('records each differing field with the raw values', () => {
    expect(getAddressDifferences(stored, {
      ...stored,
      zip_code: '07607',
      street: ['9528 HIGHWAY 25'],
      residential: true
    })).toEqual([
      { field: 'zip_code', from: '07606', to: '07607' },
      { field: 'street', from: ['9528 25 Hwy'], to: ['9528 HIGHWAY 25'] },
      { field: 'residential', from: false, to: true }
    ]);
  });

  it('skips a field the courier did not answer', () => {
    expect(getAddressDifferences(stored, { zip_code: '07606' })).toEqual([]);
  });
});

describe('isAddressConfirmed', () => {
  it('fails only on a country, state or postal code difference', () => {
    expect(isAddressConfirmed([])).toBe(true);
    expect(isAddressConfirmed([{ field: 'street', from: ['a'], to: ['b'] }, { field: 'city', from: 'a', to: 'b' }, { field: 'residential', from: false, to: true }])).toBe(true);
    expect(isAddressConfirmed([{ field: 'zip_code', from: 'L12 7N5', to: 'L9T 2X7' }])).toBe(false);
    expect(isAddressConfirmed([{ field: 'state_code', from: 'ON', to: 'QC' }])).toBe(false);
    expect(isAddressConfirmed([{ field: 'country_code', from: 'US', to: 'CA' }])).toBe(false);
  });
});
