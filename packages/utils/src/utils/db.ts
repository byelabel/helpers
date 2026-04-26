import joiDate from '@joi/date';
import { sync } from 'glob';
import joiBase from 'joi';
import cluster from 'node:cluster';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { createContext, Script } from 'node:vm';
import { cast, col, Dialect, fn, json, literal, Op, QueryTypes, where } from 'sequelize';
import { Sequelize, SequelizeOptions } from 'sequelize-typescript';
import { IInfiniteList, IList, paging } from './data';
import { throwAppError } from './error';
import { logInfo, showMessages } from './log';
import {
  isArray,
  isBoolean,
  isFunction,
  isNonEmptyArray,
  isNonEmptyString,
  isNonNullObject,
  isNumber,
  isNumeric,
  isObject,
  isString,
  isUUID
} from './validator';

const joi = joiBase.extend(joiDate);

const processId = process.pid;
const connection: Record<number, Sequelize | null> = {
  [processId]: null
};

export type IDBOptions = {
  engine?: string,
  host?: string,
  port?: number | string,
  name?: string,
  user?: string,
  pass?: string,
  useSSL?: boolean,
  prefix?: string,
  skipSync?: boolean,
  forceSync?: boolean,
  debug?: boolean,
  modelPath?: string
};

function resolveDBOptions(options?: IDBOptions): IDBOptions {
  return {
    engine: options?.engine ?? process.env.DB_ENGINE,
    host: options?.host ?? process.env.DB_HOST,
    port: options?.port ?? process.env.DB_PORT,
    name: options?.name ?? process.env.DB_NAME,
    user: options?.user ?? process.env.DB_USER,
    pass: options?.pass ?? process.env.DB_PASS,
    useSSL: options?.useSSL ?? ['true', 'TRUE'].includes(process.env.DB_USE_SSL as string),
    prefix: options?.prefix ?? process.env.DB_PREFIX,
    skipSync: options?.skipSync ?? ['true', 'TRUE'].includes(process.env.DB_SKIP_SYNC as string),
    forceSync: options?.forceSync ?? ['true', 'TRUE'].includes(process.env.DB_FORCE_SYNC as string),
    debug: options?.debug ?? ['true', 'TRUE'].includes(process.env.DB_DEBUG as string),
    modelPath: resolve(options?.modelPath ?? process.env.DB_MODEL_PATH ?? dirname(require.main?.filename ?? ''))
  };
}

export function checkDBConfig(options?: IDBOptions): IDBOptions {
  const opts = resolveDBOptions(options);

  if (!isNonEmptyString(opts.host)) {
    throwAppError('Database host configuration not found', 'MISSING_DB_HOST');
  }

  if (!isNonEmptyString(opts.name)) {
    throwAppError('Database name configuration not found', 'MISSING_DB_NAME');
  }

  if (!isNonEmptyString(opts.user)) {
    throwAppError('Database user configuration not found', 'MISSING_DB_USER');
  }

  return opts;
}

async function sequelizeConnection(dbName?: string, models?: string[], options?: IDBOptions): Promise<Sequelize> {
  const opts = resolveDBOptions(options);

  const hosts = (opts.host as string || '').split(',').map(host => host.trim()).filter(host => isNonEmptyString(host));
  const ports = String(opts.port ?? '').split(',').map(port => port.trim()).filter(port => isNumeric(port));
  const usernames = (opts.user as string || '').split(',').map(username => username.trim()).filter(username => isNonEmptyString(username));
  const passwords = (opts.pass as string || '').split(',').map(password => password.trim()).filter(password => isNonEmptyString(password));

  // force ssl
  const dialectOptions = opts.useSSL ? {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  } : {};

  const write = {
    host: hosts?.[0] || 'localhost',
    port: Number(ports?.[0] || 5432),
    username: usernames?.[0] || 'postgres',
    password: passwords?.[0] || '',
    dialectOptions
  };

  let read = null;

  if (hosts.length > 1) {
    hosts.shift();

    read = hosts.map((host, index) => ({
      host,
      port: Number(ports?.[index + 1] || write.port),
      username: usernames?.[index + 1] || write.username,
      password: passwords?.[index + 1] || write.password,
      dialectOptions
    }));
  }

  const params = isNonEmptyArray(read) ? {
    replication: {
      read,
      write
    }
  } : write;

  return new Sequelize({
    dialect: (opts.engine || 'postgresql') as Dialect,
    ...params,
    ...(isNonEmptyString(dbName) ? { database: dbName } : {}),
    ...(isNonEmptyArray(models) ? { models } : {}),
    logging: opts.debug ? console.log : null
  } as SequelizeOptions);
}

async function create(dbName?: string, options?: IDBOptions) {
  const opts = resolveDBOptions(options);

  // create connection
  const sequelize = await sequelizeConnection(undefined, undefined, opts);

  try {
    /**
     * Database Create Statement
     *
     * CREATE DATABASE webim ENCODING 'UTF-8' LC_COLLATE 'tr_TR.UTF-8' LC_CTYPE 'tr_TR.UTF-8' TEMPLATE template0;
     */

    if (!isNonEmptyString(dbName)) {
      dbName = opts.name;
    }

    if (!isNonEmptyString(dbName)) {
      throwAppError('Database configuration not found', 'MISSING_DB_CONFIG');
    }

    const rows = await sequelize.query(`SELECT "datname" FROM "pg_database" WHERE "datname" = '${dbName}'`, {
      type: QueryTypes.SELECT
    });

    if (!isNonEmptyArray(rows)) {
      await sequelize.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF-8' LC_COLLATE 'tr_TR.UTF-8' LC_CTYPE 'tr_TR.UTF-8' TEMPLATE template0`);

      logInfo(`Database created: ${dbName}`, true).catch(() => {});
    }
  } catch (e) {
  }
}

export async function getModels(path: string) {
  const models = [];

  for await (const model of sync(join(path, '..', '**', '*.model.js'), { windowsPathsNoEscape: true }).values()) {
    models.push(model);
  }

  return models;
}

export async function connect(options?: IDBOptions): Promise<Sequelize> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!connection[processId]) {
        const opts = checkDBConfig(options);

        if (cluster.isPrimary) {
          await create(opts.name, opts);
        }

        const models = await getModels(opts.modelPath as string);

        connection[processId] = await sequelizeConnection(opts.name, models, opts);

        await connection[processId].authenticate();

        if (cluster.isPrimary) {
          if (opts.skipSync) {
            for await (const model of models) {
              const file = require(model);

              if (isFunction(file?.sync)) {
                await file.sync(connection[processId]);
              }
            }
          } else {
            /**
             * Sync the database
             */
            await connection[processId].sync({
              force: opts.forceSync
            });

            logInfo(`Database Sync: ${opts.forceSync ? 'YES' : 'NO'}`, true).catch(() => {});
          }
        }
      }

      resolve(connection[processId]);
    } catch (e) {
      const opts = resolveDBOptions(options);

      if (opts?.debug) {
        showMessages([
          `DB_ENGINE     : ${opts.engine}`,
          `DB_HOST       : ${opts.host}`,
          `DB_PORT       : ${opts.port}`,
          `DB_NAME       : ${opts.name}`,
          `DB_USER       : ${opts.user}`,
          `DB_PASS       : ${opts.pass}`,
          `DB_USE_SSL    : ${opts.useSSL}`,
          `DB_PREFIX     : ${opts.prefix}`,
          `DB_SKIP_SYNC  : ${opts.skipSync}`,
          `DB_FORCE_SYNC : ${opts.forceSync}`
        ]);
      }

      reject(e);
    }
  });
}

export async function disconnect(): Promise<void> {
  if (connection[processId]) {
    await connection[processId].close();
  }
}

export function escapeString<T>(str: T | string | number, withQuotes: boolean = false): T | string | number {
  if (isNonEmptyString(str) || isNumeric(str)) {
    str = String(str);
  }

  if (isNonEmptyString(str)) {
    str = (str as string).replace(/'/g, `''`);
  }

  if (withQuotes) {
    str = `'${str}'`;
  }

  return str;
}

export type IQueryAction = {
  options: {
    user_id: string,
    action: 'insert' | 'update' | 'delete'
  }
};

export enum EFilterOperatorAlias {
  isEmpty = 'isEmpty',
  isNotEmpty = 'isNotEmpty',
  contains = 'contains',
  notContains = 'notContains',
  equals = 'equals',
  notEquals = 'notEquals',
  greater = 'greater',
  greaterOrEquals = 'greaterOrEquals',
  less = 'less',
  lessOrEquals = 'lessOrEquals',
  startsWith = 'startsWith',
  endsWith = 'endsWith',
  between = 'between',
  isAnyOf = 'isAnyOf'
}

const FilterOperatorAliasWithNoValue: { [key: string]: [string, string | Function] } = {
  [EFilterOperatorAlias.isEmpty]: ['IS', () => 'NULL'],
  [EFilterOperatorAlias.isNotEmpty]: ['IS NOT', () => 'NULL']
} as const;

const FilterOperatorAliasWithValue: { [key: string]: [string, string | Function] } = {
  [EFilterOperatorAlias.contains]: ['ILIKE', '%{value}%'],
  [EFilterOperatorAlias.notContains]: ['NOT ILIKE', '%{value}%'],
  [EFilterOperatorAlias.equals]: ['=', '{value}'],
  [EFilterOperatorAlias.notEquals]: ['!=', '{value}'],
  [EFilterOperatorAlias.greater]: ['>', '{value}'],
  [EFilterOperatorAlias.greaterOrEquals]: ['>=', '{value}'],
  [EFilterOperatorAlias.less]: ['<', '{value}'],
  [EFilterOperatorAlias.lessOrEquals]: ['<=', '{value}'],
  [EFilterOperatorAlias.startsWith]: ['ILIKE', '{value}%'],
  [EFilterOperatorAlias.endsWith]: ['ILIKE', '%{value}'],
  [EFilterOperatorAlias.between]: ['BETWEEN', (values: string[] | number[]) => isNonEmptyArray(values) ? [
    isNumber(values?.[0]) ? values[0] : escapeString(values[0], true),
    isNumber(values?.[1]) ? values[1] : escapeString(values[1], true)
  ].join(' AND ') : null],
  [EFilterOperatorAlias.isAnyOf]: ['IN', '({value})']
} as const;

const FilterOperatorAlias = {
  ...FilterOperatorAliasWithValue,
  ...FilterOperatorAliasWithNoValue
} as const;

export const FilterJoinParams: string[] = ['AND', 'OR'] as const;

export const SortDirection: string[] = ['ASC', 'DESC'] as const;

export const FilterIdOperators: string[] = [
  EFilterOperatorAlias.equals,
  EFilterOperatorAlias.notEquals,
  EFilterOperatorAlias.isEmpty,
  EFilterOperatorAlias.isNotEmpty,
  EFilterOperatorAlias.isAnyOf
] as const;

export const FilterBoolOperators: string[] = [
  EFilterOperatorAlias.equals,
  EFilterOperatorAlias.notEquals,
  EFilterOperatorAlias.isEmpty,
  EFilterOperatorAlias.isNotEmpty
] as const;

export const FilterStringOperators: string[] = [
  EFilterOperatorAlias.contains,
  EFilterOperatorAlias.notContains,
  EFilterOperatorAlias.equals,
  EFilterOperatorAlias.notEquals,
  EFilterOperatorAlias.startsWith,
  EFilterOperatorAlias.endsWith,
  EFilterOperatorAlias.isEmpty,
  EFilterOperatorAlias.isNotEmpty,
  EFilterOperatorAlias.isAnyOf,
  EFilterOperatorAlias.between
] as const;

export const FilterDateOperators: string[] = [
  EFilterOperatorAlias.equals,
  EFilterOperatorAlias.notEquals,
  EFilterOperatorAlias.greater,
  EFilterOperatorAlias.greaterOrEquals,
  EFilterOperatorAlias.less,
  EFilterOperatorAlias.lessOrEquals,
  EFilterOperatorAlias.between,
  EFilterOperatorAlias.isEmpty,
  EFilterOperatorAlias.isNotEmpty
] as const;

export const FilterNumberOperators: string[] = [
  EFilterOperatorAlias.equals,
  EFilterOperatorAlias.greater,
  EFilterOperatorAlias.greaterOrEquals,
  EFilterOperatorAlias.less,
  EFilterOperatorAlias.lessOrEquals,
  EFilterOperatorAlias.between,
  EFilterOperatorAlias.isEmpty,
  EFilterOperatorAlias.isNotEmpty,
  EFilterOperatorAlias.isAnyOf
] as const;

export function JoiFilter(name: string, type: 'string' | 'id' | 'bool' | 'number' | 'date' = 'string', label?: string, valid?: any): string {
  if (!isNonEmptyString(label)) {
    label = name;
  }

  const conditions: any = {
    ...[
      EFilterOperatorAlias.contains,
      EFilterOperatorAlias.notContains,
      EFilterOperatorAlias.equals,
      EFilterOperatorAlias.notEquals,
      EFilterOperatorAlias.startsWith,
      EFilterOperatorAlias.endsWith
    ].reduce((acc: any, key) => {
      acc[key] = type === 'id' ?
        joi.string().trim().guid({ version: ['uuidv4'] }).lowercase().required() :
        joi.alternatives().try(
          joi.string().trim().valid(...(isNonEmptyArray(valid) ? valid : [])),
          joi.number().valid(...(isNonEmptyArray(valid) ? valid : []))
        ).required();

      return acc;
    }, {}),
    [EFilterOperatorAlias.between]: joi.array().items(
      joi.string().trim().valid(...(isNonEmptyArray(valid) ? valid : [])),
      joi.number().valid(...(isNonEmptyArray(valid) ? valid : []))
    ).length(2).required(),
    [EFilterOperatorAlias.isAnyOf]: joi.array().items(type === 'id' ?
      joi.string().trim().guid({ version: ['uuidv4'] }).lowercase() :
      joi.alternatives().try(
        joi.string().trim().valid(...(isNonEmptyArray(valid) ? valid : [])),
        joi.number().valid(...(isNonEmptyArray(valid) ? valid : []))
      )
    ).min(1).required(),
    ...[
      EFilterOperatorAlias.greater,
      EFilterOperatorAlias.greaterOrEquals,
      EFilterOperatorAlias.less,
      EFilterOperatorAlias.lessOrEquals
    ].reduce((acc: any, key) => {
      if (type === 'date') {
        acc[key] = joi.alternatives().try(
          joi.string().trim().valid(...(isNonEmptyArray(valid) ? valid : [])).raw(),
          joi.number().valid(...(isNonEmptyArray(valid) ? valid : []))
        ).required();
      } else {
        acc[key] = joi.number().valid(...(isNonEmptyArray(valid) ? valid : [])).required();
      }

      return acc;
    }, {}),
    ...(type === 'date' ? [
      EFilterOperatorAlias.equals,
      EFilterOperatorAlias.notEquals,
      EFilterOperatorAlias.between
    ].reduce((acc: any, key) => {
      if (key === EFilterOperatorAlias.between) {
        acc[key] = joi.array().items(
          joi.string().trim().valid(...(isNonEmptyArray(valid) ? valid : [])),
          joi.number().valid(...(isNonEmptyArray(valid) ? valid : []))
        ).length(2).required();
      } else {
        acc[key] = joi.alternatives().try(
          joi.string().trim().valid(...(isNonEmptyArray(valid) ? valid : [])),
          joi.number().valid(...(isNonEmptyArray(valid) ? valid : []))
        ).required();
      }

      return acc;
    }, {}) : {}),
    ...(type === 'bool' ? [
      EFilterOperatorAlias.equals,
      EFilterOperatorAlias.notEquals
    ].reduce((acc: any, key) => {
      acc[key] = joi.boolean().truthy('true').sensitive(false).default(false).required();

      return acc;
    }, {}) : {}),
    ...([EFilterOperatorAlias.isEmpty, EFilterOperatorAlias.isNotEmpty].reduce((acc: any, key) => {
      acc[key] = null;

      return acc;
    }, {}))
  };

  let operators = FilterStringOperators;

  if (type === 'id') {
    operators = FilterIdOperators;
  } else if (type === 'bool') {
    operators = FilterBoolOperators;
  } else if (type === 'number') {
    operators = FilterNumberOperators;
  } else if (type === 'date') {
    operators = FilterDateOperators;
  }

  return joi.alternatives().try(
    ...operators.map(operator =>
      joi.array().ordered(
        joi.string().trim().valid(name).required().label('name'),
        joi.string().trim().valid(operator).required().label('operator'),
        ...(conditions[operator] ? [conditions[operator]] : [])
      ).label(label)
    )
  );
}

type IFilterOperatorAliasWithNoValue = keyof typeof FilterOperatorAliasWithNoValue;

type IFilterOperatorAliasWithValue = keyof typeof FilterOperatorAliasWithValue;

type IFilterJoinParams = typeof FilterJoinParams[number];

type IFilterTwoParams = [string, IFilterOperatorAliasWithNoValue];

type IFilterThreeParams = [string, IFilterOperatorAliasWithValue, string | string[] | number | number[]];

type IFilterItem = IFilterTwoParams | IFilterThreeParams;

type IFilterJoiner = Record<IFilterJoinParams, Array<IFilterJoiner | IFilterItem>>;

export type IFilter = IFilterItem[] | IFilterJoiner | Record<string, string | number>;

export type ISortDirection = typeof SortDirection[number];

export type ISortParams = [string, ISortDirection];

export type ISort = [string, ISortDirection];

export const filterSchema = (columns: Record<string, any>) => joi.object().pattern(
  joi.string().valid('and', 'or').default('and').uppercase().label('joiner'),
  joi.array().items(
    ...(Object.keys(columns).map(column => (
      joi.array().ordered(
        joi.string().valid(column).required().label(column),
        joi.string().trim().valid(...(isNonEmptyArray(columns[column]?.operators) ? columns[column]?.operators : Object.keys(FilterOperatorAlias))).required().label('operator'),
        columns[column]?.schema
      ).label('filter item')
    ))),
    joi.link('/')
  ).label('filter items')
);

function opFilter(name: symbol | string, value: any = undefined): any {
  let key: symbol | string = Op.eq;

  if (typeof name === 'symbol') {
    key = name;
  } else {
    try {
      const context: any = {
        key,
        Op
      };
      createContext(context);
      const scr = new Script(`key = Op.${String(name)};`);
      scr.runInContext(context);

      key = context.key;
    } catch (e) {
    }
  }

  return value !== undefined ? { [key]: value } : key;
}

export function filterSequelizeConverter(params: any): any {
  if (!isNonNullObject(params)) return params;

  let filters: any = {};

  Reflect.ownKeys(params).map((name: any) => {
    const value: any | Function = params[name];

    if (typeof name === 'symbol' || Op.hasOwnProperty(name)) {
      name = opFilter(name);
    }

    if (isString(value) || isNumber(value) || isBoolean(value) || (value === null) || isFunction(value)) {
      filters[name] = isFunction(value) ? (value as Function)() : value;
    } else if (isNonEmptyArray(value)) {
      filters[name] = [];

      value.forEach((v: any) => {
        filters[name].push(isFunction(v) ? v() : filterSequelizeConverter(v));
      });
    } else {
      filters[name] = filterSequelizeConverter(value);
    }
  });

  return filters;
}

function filterValueConverter(formula: string | Function, param: any): any {
  let value;

  if (isFunction(formula)) {
    value = (formula as Function)(param);
  } else if (isArray(param)) {
    value = (formula as string).replace(
      new RegExp('{value}', 'g'),
      param.reduce((arr: any, val: any) => [...arr, ((isNumber(val) || isBoolean(val)) ? val : escapeString(val, true))], []).join(', ')
    );
  } else if (isNumber(param) || isBoolean(param)) {
    value = (formula as string).replace(
      new RegExp('{value}', 'g'),
      param
    );
  } else {
    value = escapeString((formula as string).replace(
      new RegExp('{value}', 'g'),
      param
    ), true);
  }

  return value;
}

export async function filtering(params: IFilter, mapper?: Function, joiner: IFilterJoinParams = 'and'): Promise<string> {
  let filters: string[] = [];

  if (isNonEmptyArray(params)) {
    for await (const filterItem of (params as (IFilterItem | IFilterJoiner)[])) {
      if (isNonEmptyArray(filterItem)) {
        const column = (filterItem as IFilterItem)?.[0];

        if (isNonEmptyString(column)) {
          const operatorAndValue = FilterOperatorAlias?.[(filterItem as IFilterItem)?.[1] as string];

          if (operatorAndValue) {
            const operator = operatorAndValue[0], value = filterValueConverter(operatorAndValue[1], filterItem?.[2]);

            if (value !== null) {
              let result = [`"${column}"`, operator, value];

              if (isFunction(mapper)) {
                const mapperResult = await mapper?.(result, [column, filterItem[1], filterItem?.[2]]) as any;

                if (isNonEmptyArray(mapperResult) && mapperResult.every((value: string) => !isObject(value))) {
                  result = mapperResult;
                }
              }

              const filter = isNonEmptyArray(result) ? result.join(' ').trim() : null;

              if (isNonEmptyString(filter)) {
                filters.push(filter as string);
              }
            }
          }
        }
      } else if (isNonNullObject(filterItem) && ['and', 'or'].includes(Object.keys(filterItem)[0].toString().toLowerCase())) {
        const filter = await filtering(filterItem as IFilterJoiner, mapper, Object.keys(filterItem)[0]);

        if (isNonEmptyString(filter)) {
          filters.push(`(${filter})`);
        }
      }
    }
  } else if (isNonNullObject(params)) {
    for await (const key of Object.keys(params)) {
      if (['and', 'or'].includes(key.toString().toLowerCase())) {
        const filter = await filtering((params as any)[key], mapper, key);

        if (isNonEmptyString(filter)) {
          filters.push(`(${filter})`);
        }
      } else {
        const filter = await filtering([[key, (isArray((params as any)[key]) ? EFilterOperatorAlias.isAnyOf : EFilterOperatorAlias.equals), (params as any)[key]]], mapper);

        if (isNonEmptyString(filter)) {
          filters.push(filter);
        }
      }
    }
  }

  return filters.join(` ${joiner.toString().toUpperCase()} `);
}

export function sorting(params: ISortParams[], defaultParams: ISortParams[] = []): ISort[] {
  const sorts: ISort[] = [];

  if (isNonEmptyArray(params)) {
    for (const sortArray of params) {
      if (isNonEmptyArray(sortArray)) {
        sorts.push([
          sortArray[0],
          isNonEmptyString(sortArray?.[1]) && SortDirection.includes(sortArray[1].toString().toUpperCase()) ? sortArray[1].toUpperCase() as ISortDirection : SortDirection[0]
        ]);
      }
    }
  }

  return isNonEmptyArray(sorts) ? sorts : isNonEmptyArray(defaultParams) ? sorting(defaultParams) : [];
}

export function now(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!connection[processId]) {
        throwAppError('No connection found');
      }

      const [nowRow]: any[] = await (connection as Record<number, Sequelize>)[processId].query('SELECT NOW() AS "time"', {
        type: QueryTypes.SELECT
      });

      resolve(nowRow?.time);
    } catch (e) {
      reject(e);
    }
  });
}

type IGetListParams = {
  offset: number,
  limit: number,
  sqlBody: (alias: string, withColumns?: boolean, onlyDefaults?: boolean) => Promise<string>,
  replacements?: Record<string, any>,
  dataModel: Function,
  debug?: boolean
};

export function getList<T>(params: IGetListParams): Promise<IList<T>> {
  return new Promise(async (resolve, reject) => {
    try {
      const { offset, limit, sqlBody, replacements, dataModel, debug = false } = params;

      const payload: IList<T> = {
        data: [],
        offset,
        limit,
        total: {
          all: 0,
          filtered: 0
        }
      };

      // random alias
      const alias = '_t';

      const selectSql = async (alias: string, offset = 0, limit = 0) => `
        ${await sqlBody(alias, true)}
        ${(isNumeric(limit) && Number(limit) > 0) ? `OFFSET ${offset} LIMIT ${limit}` : ''}
      `.split('\n').reduce((arr: string[], line) => {
        line = line.trim();

        if (isNonEmptyString(line)) {
          arr.push(line);
        }

        return arr;
      }, []).join('\n');

      const countSql = async (alias: string, onlyDefaults = true) => sqlBody(alias, false, onlyDefaults);

      let [{ total }]: any = await sequelize().query(await countSql(alias), {
        type: QueryTypes.SELECT,
        raw: true,
        replacements,
        ...(debug ? {
          logging: console.log
        } : {})
      });

      total = Number(total);

      if (total) {
        const [{ total: filteredTotal }]: any = await sequelize().query(await countSql(alias, false), {
          type: QueryTypes.SELECT,
          raw: true,
          replacements,
          ...(debug ? {
            logging: console.log
          } : {})
        });

        payload.total.all = total;
        payload.total.filtered = Number(filteredTotal);

        if (payload.total.filtered) {
          const calculatedPaging = paging(payload.total.filtered, offset, limit);

          // update offset & limit data
          payload.offset = calculatedPaging.offset;
          payload.limit = calculatedPaging.limit;

          const rows: any[] = await sequelize().query(await selectSql(alias, payload.offset, payload.limit), {
            type: QueryTypes.SELECT,
            raw: true,
            replacements,
            ...(debug ? {
              logging: console.log
            } : {})
          });

          payload.data = (await dataModel(rows)) as T[];
        }
      }

      resolve(payload);
    } catch (e) {
      reject(e);
    }
  });
}

type IGetInfiniteListParams = {
  last_id: string,
  limit: number,
  sqlBody: (alias: string) => Promise<string>,
  replacements?: Record<string, any>,
  dataModel: Function,
  usePid?: boolean,
  debug?: boolean
};

export function getInfiniteList<T>(params: IGetInfiniteListParams): Promise<IInfiniteList<T>> {
  return new Promise(async (resolve, reject) => {
    try {
      const { last_id, limit, sqlBody, replacements, dataModel, usePid = false, debug = false } = params;

      // random table name
      const tableName = '_t';

      const payload: IInfiniteList<T> = {
        data: [],
        limit,
        more: 0
      };

      const withSql = async (limit = 0) => `
        WITH "_r" AS (
          ${await sqlBody('_b')}
        ), "${tableName}" AS (
          SELECT "_s0".*
          FROM "_r" AS "_s0"
          ${(usePid ? isNumeric(last_id) : isUUID(last_id)) ? `
          WHERE "_s0"."n" > (
            SELECT "_s1"."n"
            FROM "_r" AS "_s1"
            WHERE "_s1"."${usePid ? 'p' : ''}id" = '${last_id}'
          )` : ''}
          ${(isNumeric(limit) && Number(limit) > 0) ? `LIMIT ${limit}` : ''}
        )
      `.split('\n').reduce((arr: string[], line) => {
        line = line.trim();

        if (isNonEmptyString(line)) {
          arr.push(line);
        }

        return arr;
      }, []).join('\n');

      const selectSql = async (limit = 0) => `${await withSql(limit)}
        SELECT *
        FROM "${tableName}"
        ORDER BY "n"
      `.split('\n').reduce((arr: string[], line) => {
        line = line.trim();

        if (isNonEmptyString(line)) {
          arr.push(line);
        }

        return arr;
      }, []).join('\n');

      const countSql = `${await withSql(0)}
        SELECT COUNT(*) AS "total"
        FROM "${tableName}"
      `.split('\n').reduce((arr: string[], line) => {
        line = line.trim();

        if (isNonEmptyString(line)) {
          arr.push(line);
        }

        return arr;
      }, []).join('\n');

      let [{ total }]: any = await sequelize().query(countSql, {
        type: QueryTypes.SELECT,
        raw: true,
        replacements,
        ...(debug ? {
          logging: console.log
        } : {})
      });

      total = Number(total);

      if (total) {
        const rows: any[] = await sequelize().query(await selectSql(limit), {
          type: QueryTypes.SELECT,
          raw: true,
          replacements,
          ...(debug ? {
            logging: console.log
          } : {})
        });

        payload.data = (await dataModel(rows)) as T[];

        if (limit) {
          payload.more = limit < total ? total - limit : 0;
        }
      }

      resolve(payload);
    } catch (e) {
      reject(e);
    }
  });
}

const sequelize = () => connection[processId] as Sequelize;

export {
  cast,
  col,
  fn,
  json,
  literal,
  Op,
  QueryTypes,
  sequelize,
  Sequelize,
  where
};
