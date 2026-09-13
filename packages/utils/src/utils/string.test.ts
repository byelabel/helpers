import { describe, expect, it } from 'vitest';
import { slugify } from './string';

describe('slugify', () => {
  it('lowercases and joins words with a hyphen', () => {
    expect(slugify('Amelie Chocolate and Patisserie')).toBe('amelie-chocolate-and-patisserie');
  });

  it('drops apostrophes instead of splitting on them', () => {
    expect(slugify('Amelie’s Chocolate')).toBe('amelies-chocolate');
    expect(slugify("Amelie's Chocolate")).toBe('amelies-chocolate');
  });

  it('turns trailing punctuation into nothing', () => {
    expect(slugify('Amelie’s Chocolate and Patisserie Inc.')).toBe('amelies-chocolate-and-patisserie-inc');
  });

  it('strips diacritics', () => {
    expect(slugify('Café München GmbH')).toBe('cafe-munchen-gmbh');
    expect(slugify('Şeker Ürünleri')).toBe('seker-urunleri');
  });

  it('transliterates characters NFKD cannot decompose', () => {
    expect(slugify('Bäckerei Straße Øst')).toBe('backerei-strasse-ost');
    expect(slugify('Kırmızı & Mavi')).toBe('kirmizi-and-mavi');
    expect(slugify('€ and £ and $')).toBe('eur-and-gbp-and-usd');
    expect(slugify('Salt & Pepper')).toBe('salt-and-pepper');
  });

  it('collapses runs of separators and trims the edges', () => {
    expect(slugify('  --- Hello,   World!!! --- ')).toBe('hello-world');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('北京商贸')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('')).toBe('');
    expect(slugify(null as any)).toBe('');
    expect(slugify(undefined as any)).toBe('');
  });

  it('falls back when nothing survives', () => {
    expect(slugify('北京商贸', { fallback: 'workspace' })).toBe('workspace');
    expect(slugify('Café', { fallback: 'workspace' })).toBe('cafe');
  });

  it('honours a custom separator', () => {
    expect(slugify('Hello, World', { separator: '_' })).toBe('hello_world');
    expect(slugify('  Hello --- World  ', { separator: '.' })).toBe('hello.world');
    expect(slugify('Hello World', { separator: '' })).toBe('helloworld');
  });

  it('truncates to maxLength without leaving a trailing separator', () => {
    expect(slugify('A Very Long Company Name That Goes Well Past The Limit', { maxLength: 43 }))
      .toBe('a-very-long-company-name-that-goes-well-pas');
    expect(slugify('abcde fghij', { maxLength: 6 })).toBe('abcde');
    expect(slugify('abcde fghij', { maxLength: 5 })).toBe('abcde');
  });

  it('ignores a non-positive or non-finite maxLength', () => {
    expect(slugify('Hello World', { maxLength: 0 })).toBe('hello-world');
    expect(slugify('Hello World', { maxLength: NaN })).toBe('hello-world');
    expect(slugify('Hello World', { maxLength: -1 })).toBe('hello-world');
  });

  it('keeps digits', () => {
    expect(slugify('Store 42 — Unit 7B')).toBe('store-42-unit-7b');
  });
});
