import { isArray, isObject, isString } from './validator';

/**
 * Per-resource access: which ids of each kind of resource a caller may reach -
 * stores, carrier accounts, customer workspaces, and whatever else gets
 * per-item restrictions. `me.access` maps a resource type to its ids, e.g.
 * `{ store: ['…'], carrier: ['…'] }`.
 *
 * The split this module encodes: a **gateway decides** - it builds `me.access`
 * once per request from the user's grants (`fromGrants`) or any other source,
 * with its own policy for who is restricted at all - and **services only apply**
 * the lists as filters (`scope`, `ids`, `allowed`); no service reads grants.
 *
 * Unrestricted is either no `me.access` at all, or a type missing from it.
 * A type present with an empty list means none allowed.
 */
export type IAccess = Record<string, string[]>;

type IAccessUser = {
  access?: unknown
} | null | undefined;

const has = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

const strings = (value: unknown): string[] => isArray(value) ? value.filter(isString) : [];

/**
 * Grants → lists: every permission key `<type>.<id>` with `{ access: true }`,
 * for the requested types. Each requested type is present, empty when nothing
 * of it is granted. Who gets restricted at all is the caller's policy.
 */
export function fromGrants(permissions: Record<string, any> | null | undefined, types: string[]): IAccess {
  const access: IAccess = Object.fromEntries(types.map(type => [type, [] as string[]]));

  for (const [key, value] of Object.entries(isObject(permissions) ? permissions : {})) {
    const dot = key.indexOf('.');
    const type = key.slice(0, dot);

    if ((dot > 0) && has(access, type) && (value?.access === true)) {
      access[type].push(key.slice(dot + 1));
    }
  }

  return access;
}

// service side: the lists the gateway sent on me.access, or undefined when there are none
export function scope(me: IAccessUser): IAccess | undefined {
  const access = me?.access;

  if (!isObject(access)) return undefined;

  return Object.fromEntries(Object.entries(access).map(([type, list]) => [type, strings(list)]));
}

// the ids of one type a caller is limited to; undefined when that type is not restricted
export function ids(access: IAccess | undefined, type: string): string[] | undefined {
  return (access && has(access, type)) ? access[type] : undefined;
}

// whether one id of a type is within reach
export function allowed(access: IAccess | undefined, type: string, id: string | null | undefined): boolean {
  const list = ids(access, type);

  return !list || (!!id && list.includes(id));
}
