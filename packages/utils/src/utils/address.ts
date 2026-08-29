import { isNonEmptyString } from './validator';

export interface AddressRegion {
  code?: string | null;
  name?: string | null;
}

export interface Address {
  street?: string | string[] | null;
  city?: string | null;
  state?: string | AddressRegion | null;
  zip_code?: string | null;
  country?: string | AddressRegion | null;
}

// people read names, machines read codes — prefer the name on anything displayed
function regionName(region?: string | AddressRegion | null): string {
  if (isNonEmptyString(region)) return (region as string).trim();

  const { name, code } = (region as AddressRegion) || {};

  if (isNonEmptyString(name)) return (name as string).trim();
  if (isNonEmptyString(code)) return (code as string).trim();

  return '';
}

/**
 * Renders an address as display lines:
 *
 *   <street lines>
 *   <city>, <state name> <zip code>
 *   <country name>
 *
 * States and countries may be plain strings or { code, name } objects; the
 * name wins over the code. Empty parts collapse instead of leaving separators.
 */
export function formatAddressLines(address?: Address | null): string[] {
  if (!address || typeof address !== 'object') return [];

  const street = Array.isArray(address.street) ? address.street : [address.street];

  const lines = street
    .map(line => (isNonEmptyString(line) ? (line as string).trim() : ''))
    .filter(Boolean);

  const region = [
    isNonEmptyString(address.city) ? (address.city as string).trim() : '',
    [regionName(address.state), isNonEmptyString(address.zip_code) ? (address.zip_code as string).trim() : '']
      .filter(Boolean).join(' ')
  ].filter(Boolean).join(', ');

  if (region) lines.push(region);

  const country = regionName(address.country);

  if (country) lines.push(country);

  return lines;
}

export function formatAddress(address?: Address | null, separator = '\n'): string {
  return formatAddressLines(address).join(separator);
}
