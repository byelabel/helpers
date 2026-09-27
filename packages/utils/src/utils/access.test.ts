import { describe, expect, it } from 'vitest';
import { allowed, fromGrants, ids, resolve, scope } from './access';

const permissions = {
  workspace: { order: true },
  settings: { carrier: true },
  'store.a': { access: true },
  'store.b': { access: false },
  'carrier.fedex-1': { access: true },
  'carrier.x': {},
  'product.p1': { access: true }
};

describe('fromGrants', () => {
  it('builds a list for every requested type from its <type>.<id> grants', () => {
    expect(fromGrants(permissions, ['store', 'carrier'])).toEqual({ store: ['a'], carrier: ['fedex-1'] });
  });

  it('picks up a new type without any change, once it is requested', () => {
    expect(fromGrants(permissions, ['product'])).toEqual({ product: ['p1'] });
  });

  it('lists a requested type with no grants as empty - none allowed, not unrestricted', () => {
    expect(fromGrants({}, ['store'])).toEqual({ store: [] });
    expect(fromGrants(undefined, ['store', 'carrier'])).toEqual({ store: [], carrier: [] });
  });

  it('ignores plain scopes and types it was not asked for', () => {
    expect(fromGrants(permissions, [])).toEqual({});
  });
});

describe('resolve', () => {
  it('keeps a stored list and leaves out a stored null (every one)', () => {
    expect(resolve({ store: ['a'], carrier: null }, { store: { missing: 'none' }, carrier: { missing: 'none' } })).toEqual({ store: ['a'] });
  });

  it('reads a type with nothing stored by its rule', () => {
    expect(resolve({}, { store: { missing: 'none' }, carrier: { missing: 'none' } })).toEqual({ store: [], carrier: [] });
    expect(resolve(null, { store: { missing: 'none' } })).toEqual({ store: [] });
    expect(resolve({}, { workspace: { missing: 'all' } })).toEqual({});
  });

  it('reads an empty list by its rule - none by default', () => {
    expect(resolve({ store: [] }, { store: {} })).toEqual({ store: [] });
    expect(resolve({ workspace: [] }, { workspace: { empty: 'all' } })).toEqual({});
  });

  it('keeps stored types that have no rule, by the defaults', () => {
    expect(resolve({ product: ['p1'], zone: null })).toEqual({ product: ['p1'] });
  });

  it('keeps only string ids and ignores a malformed value', () => {
    expect(resolve({ store: ['a', 1, null] })).toEqual({ store: ['a'] });
    expect(resolve('nope', { store: { missing: 'none' } })).toEqual({ store: [] });
  });
});

describe('scope', () => {
  it('reads back what the gateway put on me.access', () => {
    expect(scope({ access: { store: ['a'], carrier: [] } })).toEqual({ store: ['a'], carrier: [] });
  });

  it('never looks at the grants themselves', () => {
    expect(scope({ permissions } as any)).toBeUndefined();
  });

  it('keeps only string ids', () => {
    expect(scope({ access: { store: ['a', 1, null], carrier: 'x' } })).toEqual({ store: ['a'], carrier: [] });
  });

  it('refuses a malformed value', () => {
    expect(scope({ access: ['a'] })).toBeUndefined();
    expect(scope({ access: 'a' })).toBeUndefined();
  });
});

describe('ids / allowed', () => {
  const access = { store: ['a'], carrier: [] };

  it('answers per type', () => {
    expect(ids(access, 'store')).toEqual(['a']);
    expect(allowed(access, 'store', 'a')).toBe(true);
    expect(allowed(access, 'store', 'b')).toBe(false);
    expect(allowed(access, 'store', null)).toBe(false);
  });

  it('treats an empty list as none allowed', () => {
    expect(allowed(access, 'carrier', 'anything')).toBe(false);
  });

  it('treats a type the gateway did not restrict as unrestricted', () => {
    expect(ids(access, 'product')).toBeUndefined();
    expect(allowed(access, 'product', 'anything')).toBe(true);
  });

  it('lets everything through without access', () => {
    expect(ids(undefined, 'store')).toBeUndefined();
    expect(allowed(undefined, 'store', 'anything')).toBe(true);
  });
});
