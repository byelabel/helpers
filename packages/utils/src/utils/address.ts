import { isArray, isNonEmptyString, isNonNullObject, isUndefined } from './validator';

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
  if (!isNonNullObject(address)) return [];

  const street = isArray(address.street) ? address.street : [address.street];

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

/** A courier-validated address, flat: the shape address validation sends and answers with. */
export interface ValidatedAddress {
  country_code?: string | null;
  zip_code?: string | null;
  state_code?: string | null;
  city?: string | null;
  street?: string[] | null;
  residential?: boolean | null;
}

/** One field where the courier's answer differs from the address as it is stored. */
export interface AddressDifference {
  field: keyof ValidatedAddress;
  from: any;
  to: any;
}

/**
 * The fields that decide whether an address counts as valid. The courier reads through a wrong
 * postal code (given `L12 7N5` with a real street it answers `L9T 2X7` in another city, without a
 * word), so these have to come back as they went in. A rewritten street (`9528 25 Hwy` →
 * `9528 HIGHWAY 25`), a corrected city or the residential flag are detail, not a disagreement.
 */
export const ADDRESS_DECIDING_FIELDS: Array<keyof ValidatedAddress> = ['country_code', 'state_code', 'zip_code'];

// case and spacing are formatting, and a US ZIP+4 extension is the courier adding detail:
// 07606 and 07606-1723 are the same postal code
const normalizeAddressValue = (value: any): string => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
const normalizeZipCode = (value: any): string => normalizeAddressValue(value).split('-')[0];

/**
 * Where the courier's answer (`resolved`) differs from the stored address (`value`), field by field.
 * A field the courier did not answer is skipped. `from`/`to` are the raw values, for the panel to
 * label and format.
 */
export function getAddressDifferences(value?: ValidatedAddress | null, resolved?: ValidatedAddress | null): AddressDifference[] {
  const pairs: [keyof ValidatedAddress, any, any][] = [
    ['country_code', value?.country_code, resolved?.country_code],
    ['zip_code', value?.zip_code, resolved?.zip_code],
    ['state_code', value?.state_code, resolved?.state_code],
    ['city', value?.city, resolved?.city],
    ['street', isArray(value?.street) ? value!.street : [], isUndefined(resolved?.street) ? undefined : (isArray(resolved?.street) ? resolved!.street : [])],
    ['residential', value?.residential === true, isUndefined(resolved?.residential) ? undefined : resolved?.residential === true]
  ];

  return pairs.reduce((differences: AddressDifference[], [field, from, to]) => {
    if (isUndefined(to)) return differences;

    const same = (field === 'zip_code')
      ? (normalizeZipCode(from) === normalizeZipCode(to))
      : (isArray(from) || isArray(to))
        ? (normalizeAddressValue((from || []).join(' ')) === normalizeAddressValue((to || []).join(' ')))
        : (normalizeAddressValue(from) === normalizeAddressValue(to));

    return same ? differences : [...differences, { field, from, to }];
  }, []);
}

/** Whether the differences leave the address valid: none of them is a deciding field. */
export function isAddressConfirmed(differences: Array<{ field: string }>): boolean {
  return !differences.some(difference => (ADDRESS_DECIDING_FIELDS as string[]).includes(difference.field));
}
