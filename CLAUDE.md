# helpers

`helpers/` is a **separate pnpm workspace** (not part of the service monorepo build) that produces the two published npm packages every other project consumes:

| Package | Consumed by | Purpose |
|---|---|---|
| `@byelabel/utils` | all 15 backend/gateway services + `app-ui`, `admin-ui` | config, db, rabbit, redis, events, jobs, log, validator, error, output, dto, money, number, string, data, crypt, encryption, address |
| `@byelabel/react` | `app-ui`, `admin-ui` only | hooks (`useTable`, `useDebouncedValue`, …), `AppContext`, color utils |

## Layout & build

```
helpers/
  package.json           # private workspace root ("byelabel-helpers")
  pnpm-workspace.yaml    # packages/*
  tsconfig.base.json
  packages/utils/src/utils/*.ts   -> build/utils/*.js  (CommonJS, target ES6)
  packages/react/src/...          -> build/...         (ESM)
  scripts/release.mjs             # version + CHANGELOG + build + test + tag + push
```

```bash
pnpm build                              # both packages in parallel
pnpm --filter @byelabel/utils run build # rm -rf build && tsc
pnpm test                               # vitest (utils has *.test.ts next to each module)
pnpm release utils [patch|minor|3.2.0]  # tags; publish.yml publishes with OIDC provenance
```

**Not linked locally.** Services depend on a published range (`"@byelabel/utils": "^3.3.0"`) resolved from npmjs.com — a change here is invisible to a service until it is released and the service's lockfile is updated. `*.test.ts` are excluded from the build.

## Importing

Every module has a subpath export; the barrel re-exports all of them. `db`, `rabbit` and `redis` all export `connect`/`disconnect`, so the barrel exposes them **only as namespaces**:

```ts
import { db, rabbit, redis } from '@byelabel/utils';        // namespaces
import { AppError, isUUID, toResult } from '@byelabel/utils'; // flat re-exports
import { sendMessageForReply } from '@byelabel/utils/rabbit'; // subpath (preferred)
```

Subpaths: `/address` `/config` `/crypt` `/data` `/db` `/dto` `/encryption` `/error` `/events` `/jobs` `/log` `/money` `/number` `/output` `/rabbit` `/redis` `/string` `/validator`. There is **no `/file` module** (file typing lives per-service, e.g. `job/src/modules/file/file.types.ts`).

`dto` and `events` have a **default export** as well as named ones — `import dto from '@byelabel/utils/dto'`, `import eventEmitter from '@byelabel/utils/events'`.

---

## Modules

### `config` — `@byelabel/utils/config`

| Export | Signature | What it does |
|---|---|---|
| `loadEnv` | `(envFile = '.env', options?: { vars?: Record<string,string> }) => { rootPath, workingPath, routePrefix }` | dotenv-loads `<cwd>/<envFile>` in Node; in a browser falls back to the bundler-inlined `process.env`. Exits the process on a dotenv parse error. |

**Import for the side effect** — `import '@byelabel/utils/config';` is the first line of every service `index.ts`. On Node it auto-runs `loadEnv()` and sets `process.env.WORKING_PATH` (dir of `require.main`, i.e. `build/`), `process.env.ROOT_PATH` (`process.cwd()`) and a normalized `process.env.ROUTE_PREFIX`. Everything else (`db`, `rabbit`, model `tableName` constants) reads env at module load, so this import must come first.

### `validator` — `@byelabel/utils/validator`

All predicates, all return `boolean` (most are TS type guards). Backbone of the codebase — used instead of lodash `isEmpty`/`isNil`.

| Export | True when |
|---|---|
| `isBuffer(v)` / `isReadableStream(v)` | `instanceof Buffer` / `instanceof stream.Readable` |
| `isError(v)` / `isAppError(v)` | `instanceof Error` / `instanceof AppError` |
| `isSymbol` `isUndefined` `isNull` `isBoolean` `isNumber` `isString` `isArray` `isObject` | `Object.prototype.toString` tag match — `isObject` is **plain objects only** |
| `isObjectLike(v)` | `typeof v === 'object' && v !== null` (class instances, arrays, dates) |
| `isNonEmptyArray(v)` | array with `length > 0` |
| `isNonEmptyString(v)` | string `!== ''` (whitespace still counts as non-empty) |
| `isNonNullObject(v)` | plain object with **at least one key** — not merely "not null" |
| `isNumeric(v)` | a real number, or a non-empty string that `Number()` parses |
| `isInteger(v)` | `isNumeric` and integral |
| `isEmpty(v)` / `isNotEmpty(v)` | null \| undefined \| `''` \| `[]` \| `{}` |
| `isFunction(v)` / `isAsyncFunction(v)` | `isFunction` is `'[object Function]'` **or** `isAsyncFunction`; generator functions (`'[object GeneratorFunction]'`) are **not** matched |
| `isUUID(v)` | RFC 4122 v1–v8, plus nil and max UUIDs |
| `isEmail(v)` | `/^[^@]+@[^@]+$/` — deliberately loose |
| `isPhoneNumber(v)` | NANP-ish with optional country code and extension |
| `isURL(v)` | parses as a URL **and** scheme is `http:`/`https:` |
| `isTCNumber(v)` | Turkish national id checksum |

### `error` — `@byelabel/utils/error`

| Export | Signature | What it does |
|---|---|---|
| `AppError` | `new AppError(message, code?, args?)` | Expected/business error. When `code` is omitted it is **derived from the message**: uppercased, non-alphanumerics collapsed to `_` (`'Subscription not found'` → `SUBSCRIPTION_NOT_FOUND`). `toJSON()` → `{ code, message, args }`. |
| `ResponseError` | `new ResponseError(message, status = 200)` | `AppError` + HTTP `status`; `toJSON()` adds `status`. Gateway use. |
| `throwAppError` | `(message, code?, args?) => void` (declared `void`, always throws) | The idiomatic raise. Because the return type is `void`, TS does **not** narrow after it — code following it still needs `!` or a guard. |
| `getErrorOrigin` | `(error) => { file, line, column, func } \| null` | First stack frame that is not `node:` or `node_modules/`. |
| `getErrorString` | `(error) => string` | `"<message> - [<func> @ <file>:<line>:<col>]"`. |

Importing this module **patches `Error.prototype.toJSON`** globally (once) so any error survives `JSON.stringify` across RabbitMQ.

### `data` — `@byelabel/utils/data`

| Export | Signature | What it does |
|---|---|---|
| `IList<T>` | `{ data: T[], offset, limit, total: { all, filtered } }` | offset/limit list envelope. |
| `IInfiniteList<T>` | `{ data: T[], limit?, more: boolean \| number }` | cursor list envelope; `more` is the **count of remaining rows** (0 when exhausted). |
| `IResult` | `{ success, payload } \| { success, error }` | |
| `toResult` | `(error?, payload?) => IResult` | Non-`AppError` errors are replaced by `new AppError(message, 'SYSTEM_ERROR')`. |
| `paging` | `(total = 0, offset = 0, limit = 20) => { offset, limit, total }` | Clamps: `limit` capped at **1000**, out-of-range `offset` reset to 0. |

### `dto` — `@byelabel/utils/dto`

| Export | Signature | What it does |
|---|---|---|
| `validateSchema` | `(schema: Joi.Schema, params: any, async = false) => any \| Promise<any>` | Validates and **returns the coerced value** (defaults applied, strings trimmed/lowercased). On failure throws/rejects `AppError('<joi message>', 'VALIDATION_ERROR', { errors: [{ name, message }] })` where `name` is the dotted joi path. Sync by default. |
| `phoneNumberValidation` | `(value, helpers) => value` | Joi `.custom()` adapter around `isPhoneNumber`. |
| `dto` (default) | `(path: string, defaultDataModel?: Function) => Promise<{ dataModel, ...fileExports }>` | Lazily `require`s `<path>.js` (or `<path>/index.js`) and merges its exports over a default `dataModel` that just calls `.toJSON()` on each row. Used to resolve a `{ schema, converter, dataModel }` trio by convention — see `logging/src/modules/log/log.service.ts#create`. |

### `output` — `@byelabel/utils/output` (Express only; `express` is an optional peer dep)

| Export | Signature | What it does |
|---|---|---|
| `responseData` | `(error?, payload?, transaction?) => IResponseData` | `{ success: true, payload, transaction? }` or `{ success: false, error, transaction? }`. A non-`AppError` is returned as a bare `AppError(message,'SYSTEM_ERROR')` (note: **not** wrapped in the envelope). |
| `toResponse` | `(req, res, callback: (transactionId) => Promise<any>, onError?) => void` | The gateway route wrapper. Mints an md5 transaction id, times the handler with `perf_hooks`, and `res.json(responseData(...))`. Resolving `undefined` sends **nothing** (the handler already wrote the response). A rejection that is not an `AppError` logs and sets HTTP 500; an `AppError` keeps HTTP 200 with `success: false`. When `process.env.LOG` contains `request`/`response` it fire-and-forgets `log.event` messages. Called with a non-function `callback` it replies 405. |

### `log` — `@byelabel/utils/log`

| Export | Signature | What it does |
|---|---|---|
| `writeToFile` | `(data, type: IErrorType = 'error') => { path, name, fullPath }` | Appends `HH:MM:SS - <data>` to `<ROOT_PATH>/<LOGS_PATH\|logs>/YYYY-MM-DD-<type>.log`. **Synchronous** (`appendFileSync`). |
| `logInfo` / `logWarning` | `(message, show = false) => Promise<string>` | Write + `console.log` when `DEBUG=true` or `show`. Never reject. |
| `logError` | `(name, error, args?, show = false) => Promise<string>` | Writes `<name> - <getErrorString(error)> (<args JSON>)`. For a plain `Error`, when `SEND_LOGS=true` and the error file's line count is a multiple of 10, emails the last 10 lines via `message.send`. Never rejects. |
| `showMessages` | `(messages: string[]) => void` | Boxed `console.info` banner (the service-start block). |

`IErrorType = 'error' \| 'warning' \| 'info' \| 'request' \| 'webservice' \| 'event'`.

### `events` — `@byelabel/utils/events`

| Export | Signature | What it does |
|---|---|---|
| `eventEmitter` (default) | `EventEmitter2` | Per-PID singleton, `wildcard: true`, delimiter `.`. |
| `IEventResult` | `{ error?: AppError \| Error, payload?: any, events?: Record<string, Function> }` | The **RPC reply envelope** for every `src/events/*.ts` handler. |
| `attachEvents` | `(path: string) => Promise<void>` | Globs `<path>/events/**/*.js`. With `EVENTS=*` every named export of `events/<queue>.js` is registered as `<queue>.<export>` (`default` registers as bare `<queue>`). Otherwise `EVENTS` is a comma list of `name.pattern` entries (`log.query`) — `name` picks the file, `pattern` the export. Logs, never throws. |
| `eventResult` | `(name, fn: Function \| undefined, callback: () => Promise<any>, events?) => Promise<IEventResult>` | Runs `callback()`; resolves `{ payload, events }` on success or `{ error, events }` on failure and also invokes `fn(error, payload, events)` (the RabbitMQ reply callback). **Never rejects** — errors are logged via `logError('Event: <name>', …)` and non-`AppError`s are re-wrapped as `SYSTEM_ERROR`. |

### `jobs` — `@byelabel/utils/jobs`

| Export | Signature | What it does |
|---|---|---|
| `runJobs` | `(path: string, ...args) => Promise<void>` | Same file/pattern resolution as `attachEvents` but over `<path>/jobs/**/*.js`, driven by `JOBS`. With `JOBS=*` each named export runs; the logical name is `<file><UpperFirst(export)>` (`sync.ts` exporting `shipments` → `syncShipments`). Each function is invoked **inside a `node:vm` context** with `logError` and `...args` in scope, so a job body cannot see the module scope of `runJobs`. |

### `rabbit` — `@byelabel/utils/rabbit`

Config from `RABBIT_*` env (validated by Joi, overridable per call): `messageMaxSize` **5 000 000 bytes** default, `timeout` 0, `heartbeat` 60, `prefetch` 10, `maxRetries` 10, `retryDelay` 500 ms, `retryMaxDelay` 5000 ms, `keepAlive` true. `RABBIT_NAMESPACE`, when set, prefixes every queue/exchange with `<namespace>/`.

| Export | Signature | What it does |
|---|---|---|
| `checkRabbitConfig` | `(options?) => IRabbitOptions` | Joi-validates env + overrides; throws `INVALID_RABBIT_CONFIGURATION`. |
| `connect` | `(options?) => Promise<{ connection, channel }>` | Per-PID singleton with a shared in-flight promise. One `ConfirmChannel`, `prefetch` applied. Exponential backoff `retryDelay * 2^attempt` capped at `retryMaxDelay`, up to `maxRetries`. On `close` the cached connection/channel are nulled and all in-flight RPC waiters are failed with `CHANNEL_CLOSED`. |
| `disconnect` | `() => Promise<void>` | Closes channel then connection. |
| `sendMessage` | `(name, data?, options?: { timeout? }) => Promise<void>` | Fire-and-forget. `name` splits on the **first** `.` into `queue` and `pattern`; body is `{ pattern, data }`. Asserts the queue durable. Over `messageMaxSize` it switches to stream mode. |
| `sendMessageForReply` | `(name, data?, callback?, options?) => Promise<any>` | RPC. Resolves the **peer's `IEventResult`** — i.e. `{ error, payload, events }`, *not* the payload. Uses RabbitMQ **direct reply-to** (`amq.rabbitmq.reply-to`, one no-ack consumer per channel, nothing declared per call). Correlation id is a UUID. Rejects `AppError('No response from service (<name>)', 'NO_RESPONSE_FROM_SERVICE')` after `(options.timeout ?? RABBIT_TIMEOUT ?? 60)` seconds. `callback(error, payload)` is invoked too, if given. |
| `sendMessageForReplyStream` | `(name, data?, options?) => Promise<Readable>` | Same request path; the reply is delivered as a stream — open-ended (`headers.streaming`), assembled-then-wrapped (`headers.length > 0`), or a single small buffer. |
| `receiveMessage` | `(queue, callback?) => Promise<void>` | Asserts a durable queue, consumes with `noAck: false`, reassembles stream chunks, JSON-parses to `{ pattern, data }` and calls `callback(params)`. The callback's `{ events, ...result }` is JSON-encoded to `replyTo` when set; a `Readable` payload is piped through the chunk protocol instead. **Always acks, including on handler error** (no dead-letter configured — requeueing would loop). |
| `publishMessage` | `(exchange, key, data?) => Promise<void>` | Asserts a non-durable **fanout** exchange, publishes `{ key, data }`. Chunked over `messageMaxSize` (chunks go through the exchange itself). |
| `receivePublishedMessage` | `(exchange, key, callback?) => Promise<void>` | Binds an exclusive anonymous queue to the fanout exchange, `noAck: true`. `key === '*'` delivers the whole `{ key, data }`; otherwise only messages whose `key` matches, and the callback gets `data` alone. |
| `listen` | `(showInfo = false) => Promise<void>` | The service main loop. For each `RABBIT_QUEUES` entry, `receiveMessage` bridges into `eventEmitter.emit('<queue>.<pattern>', data, cb)`; **no listener → `AppError('No listener (<name>) found','NO_LISTENER_FOUND')`** returned to the caller (this is what the `job` health check exploits as a liveness ping). For each `RABBIT_EXCHANGES` entry it subscribes with key `*` and re-emits as `<exchange>.<key>`. Re-arms itself on channel close and retries every 5 s on failure. |

**Stream mode (`> RABBIT_MESSAGE_MAX_SIZE`).** The sender asserts an anonymous `durable + autoDelete` queue with `expires = (options.timeout ?? RABBIT_TIMEOUT ?? 30) * 1000` ms and splits the buffer. **Chunk 0 goes to the real target queue** (carrying the original properties); chunks 1..n go to the temp queue with `correlationId = <stream id>`. Every chunk carries `headers: { id, queue, index, length }`. The receiver, on seeing `index === 0`, opens a **dedicated channel** (so a 404 on an expired chunk queue cannot kill the shared channel), drains the temp queue, concatenates in `index` order, deletes the queue and closes the channel. It gives up after the same timeout with `STREAM_TIMEOUT`, or `STREAM_CHUNKS_LOST` if the queue is already gone.

### `redis` — `@byelabel/utils/redis`

| Export | Signature | What it does |
|---|---|---|
| `checkRedisConfig` | `(options?) => IRedisOptions` | Joi over `REDIS_HOST/PORT/USER/PASS/DB/FLUSH_DB`; throws `INVALID_REDIS_CONFIGURATION`. |
| `createURI` | `(host, port, user?, pass?, db?) => string` | `redis://[user][:pass]@host:port[/db]`, credentials URI-encoded. |
| `connect` | `(options?) => Promise<RedisClientType \| RedisClusterType>` | Per-PID singleton. A **comma-separated `REDIS_HOST` switches to `createCluster`** (and then `db` is ignored). Runs `FLUSHDB` on ready when `REDIS_FLUSH_DB=true`. |
| `disconnect` | `() => Promise<void>` | `client.destroy()`. |

Uses **`redis` v5**. Services that need BullMQ bring their own `ioredis` client instead (see `webhook/src/utils/redis.ts`).

### `db` — `@byelabel/utils/db`

| Export | Signature | What it does |
|---|---|---|
| `checkDBConfig` | `(options?) => IDBOptions` | Joi over `DB_*`; resolves `modelPath` (default: dir of `require.main`). Throws `INVALID_DB_CONFIGURATION`. |
| `getModels` | `(path) => Promise<string[]>` | Globs `<path>/**/*.model.js`. |
| `connect` | `(options?) => Promise<Sequelize>` | Per-PID singleton. On the primary: creates the database if missing, then either `sequelize.sync({ force: DB_FORCE_SYNC })` **or**, when `DB_SKIP_SYNC=true`, calls the exported `sync(sequelize)` of every model file that has one (the manual-DDL escape hatch — see `logging`). Multiple comma-separated `DB_HOST` values become Sequelize `replication` (first = write, rest = read). |
| `disconnect` | `() => Promise<void>` | |
| `sequelize` | `() => Sequelize` | The live connection for this PID. **Call it** — `db.sequelize().query(...)`. |
| `trimSql` | `(sql?) => string` | Strips leading/trailing whitespace per line and drops blank lines. Wrap every template-literal query in it. |
| `escapeString` | `(str, withQuotes = false) => string` | `'` → `''`, optional wrapping quotes. |
| `filtering` | `(params: IFilter, mapper?: Function, joiner: 'and'\|'or' = 'and') => Promise<string>` | **The filter compiler.** Turns the wire filter into a raw SQL `WHERE` fragment. Accepts an array of `[column, operator, value?]` tuples, nested `{ and: [...] }` / `{ or: [...] }` objects, or a flat `{ col: value }` map (array value ⇒ `isAnyOf`, scalar ⇒ `equals`). `mapper(result, raw)` may rewrite `[lhs, operator, value]` — every service uses it to qualify the column with its alias. |
| `sorting` | `(params: ISortParams[], defaultParams = []) => ISort[]` | Normalizes direction to `ASC`/`DESC`, falls back to `defaultParams`. |
| `JoiFilter` | `(name, type: 'string'\|'id'\|'bool'\|'number'\|'date' = 'string', label?, valid?) => Joi.Schema` | Builds the `joi.alternatives()` for one filterable column, restricted to the operator set for that type. Feed the results into `joi.array().items(...)` — see any `*.dto.ts`. |
| `filterSchema` | `(columns: Record<string, { operators?, schema? }>) => Joi.Schema` | Whole-object variant of `JoiFilter`. |
| `filterSequelizeConverter` | `(params) => any` | Rehydrates string `Op.*` keys into real Sequelize `Op` symbols (for filters that crossed a JSON boundary). |
| `now` | `() => Promise<string>` | `SELECT NOW()`. |
| `getList<T>` | `({ offset, limit, sqlBody(alias, withColumns?, onlyDefaults?), replacements?, dataModel, debug? }) => Promise<IList<T>>` | Offset pagination. Calls `sqlBody` **three times**: unfiltered count, filtered count, then the page — so `sqlBody` must honour `withColumns` (SELECT columns vs `COUNT(*) AS "total"`) and `onlyDefaults` (skip user filters). Skips work entirely when the unfiltered total is 0. |
| `getInfiniteList<T>` | `({ last_id, limit, sqlBody(alias), replacements?, dataModel, usePid?, debug? }) => Promise<IInfiniteList<T>>` | Cursor pagination. `sqlBody` must emit a `ROW_NUMBER() OVER (...) AS "n"` column plus `id` (or `pid` when `usePid: true`); the helper wraps it in a CTE and slices `WHERE "n" > (SELECT "n" ... WHERE id = :last_id)`. `last_id` is ignored unless it is a UUID (or numeric when `usePid`). |
| re-exports | `Sequelize` `Model` `Table` `Column` `DataType` `Default` `AllowNull` `PrimaryKey` `AutoIncrement` `Unique` `Index` `Length` `Scopes` `BelongsTo` `HasMany` `ForeignKey` `CreatedAt` `UpdatedAt` `DeletedAt` `Before/After Create\|Update\|Upsert` `Op` `QueryTypes` `Transaction` `SequelizeScopeError` `fn` `col` `cast` `json` `literal` `where` | Models import **only** from `@byelabel/utils/db`, never from `sequelize` directly. |
| `IQueryAction` | `{ options: { user_id, action: 'insert'\|'update'\|'delete' } }` | Type for the `@AfterCreate`/`@AfterUpdate` audit hooks that emit `log.query`. |

Operator aliases understood by `filtering` / `JoiFilter`: `isEmpty` `isNotEmpty` `contains` `notContains` `equals` `notEquals` `greater` `greaterOrEquals` `less` `lessOrEquals` `startsWith` `endsWith` `between` `isAnyOf`. `contains`/`startsWith`/`endsWith` compile to `ILIKE` (case-insensitive).

There is **no `createFilters` export.** Each service defines its own local `createFilters(filter, alias)` as a thin `db.filtering(filter, mapper)` wrapper whose mapper qualifies (and sometimes rewrites) the column. Copy the nearest one rather than inventing a new shape.

### `money` — `@byelabel/utils/money`

| Export | Signature | What it does |
|---|---|---|
| `getCurrencyDecimals` | `(code = 'USD') => 0 \| 2 \| 3` | 0 for JPY/KRW/CLP/VND/XAF/… , 3 for BHD/IQD/JOD/KWD/LYD/OMR/TND, else 2. |
| `isZeroDecimalCurrency` | `(code) => boolean` | |
| `toMinor` | `(amount, code = 'USD') => number` | Major → minor, `Math.round`. Non-numeric input becomes 0. |
| `toMajor` | `(minor, code = 'USD') => number` | Minor → major, fixed to the currency's decimals. |
| `display` | `(amount, { currency = 'USD', locale, minor = false, decimals = true, symbol = true }) => string` | `Intl.NumberFormat`. Pass `minor: true` when handing it a stored value. |

### `number` — `@byelabel/utils/number`

| Export | Signature | What it does |
|---|---|---|
| `toNumber` | `(n, scale = 2) => number` | `Number(n.toFixed(scale))`; non-numeric → 0. |
| `format` | `(n, { locale, decimals, grouping = true })` | Decimal `Intl` format. |
| `currency` | `(n, code = 'USD', { locale, decimals = true, symbol = true })` | Formats a **major-unit** number (contrast `money.display`). |
| `currencySymbol` | `(code = 'USD', { locale }) => string \| undefined` | |
| `percent` | `(n, { locale, decimals })` | Divides by 100 first — pass `12.5` for `12.5%`. |
| `short` | `(n, { locale, decimals = 1, long = false })` | Compact notation (`1.2K`). |
| `formatBytes` | `(bytes) => string` | Starts at **KB** — `formatBytes(500)` is `0.5 KB`, never bytes. |
| `getRandom` | `(min, max) => number` | Inclusive integer. |
| `toLb` `toOz` `toKg` `toGr` | `(value, unit: 'lb'\|'oz'\|'kg'\|'gr') => number` | Weight conversion; rounds to 2 (lb/oz), 3 (kg), 1 (gr) decimals. |
| `toIn` `toCm` | `(value, unit: 'in'\|'cm') => number` | Length conversion (2 / 1 decimals). |

### `crypt` — `@byelabel/utils/crypt`

| Export | Signature | What it does |
|---|---|---|
| `createHash` | `(str, algorithm: 'sha256' \| 'md5' = 'sha256', secret?) => string` | `sha256` is an **HMAC** keyed by `secret ?? TOKEN_SECRET ?? 'the world is mine'`; `md5` is a plain digest and **ignores `secret`**. Hex. |
| `comparePassword` | `(hash, password) => boolean` | `hash === createHash(password)` — plain `===`, not timing-safe. |
| `createRandomHash` | `(length = 80) => string` | `randomBytes(length/2)` hex — cryptographically random. |
| `createKey` | `(length = 6) => string` | Numeric string; **`Math.random`**, not secure. |
| `createToken` | `(length = 6, prefix = '') => string` | Unambiguous alphabet (no `0`,`1`,`l`,`O`,`I`); **`Math.random`**, not secure. |
| `getRandomNumber` | `(min, max) => number` | Inclusive; `Math.random`. |
| `createSimpleHash` | re-export of `node:crypto.createHash` | |

### `encryption` — `@byelabel/utils/encryption`

AES-256-GCM, 12-byte IV, 16-byte auth tag.

| Export | Signature | What it does |
|---|---|---|
| `getKey` | `(password, salt) => CipherKey` | `scryptSync`, 32 bytes. |
| `encrypt` | `(clearText, key) => Buffer` | Returns `iv ‖ ciphertext ‖ authTag`. |
| `decrypt` | `(encryptedText: Buffer, key) => string` | Inverse; throws on a tag mismatch. |

### `address` — `@byelabel/utils/address`

| Export | Signature | What it does |
|---|---|---|
| `formatAddressLines` | `(address?) => string[]` | `[...street, "<city>, <state> <zip>", "<country>"]`, empty parts collapsed. `state`/`country` may be a string or `{ code, name }` — **name wins over code**. |
| `formatAddress` | `(address?, separator = '\n') => string` | Joined form. |

### `string` — `@byelabel/utils/string`

| Export | Signature | What it does |
|---|---|---|
| `slugify` | `(value, options?: { separator = '-', maxLength?, fallback = '' }) => string` | URL/DB-safe ASCII slug. Lowercases, transliterates what NFKD cannot decompose (`æ œ ß ø đ ð ł þ ı € £ $ &` → `ae oe ss o d d l th i eur gbp usd and`), strips diacritics, **drops apostrophes** (`Amelie’s` → `amelies`, not `amelie-s`), and turns every other run of non-`[a-z0-9]` — punctuation, spaces, emoji, non-latin scripts — into a single `separator`. Edge separators are trimmed, `maxLength` truncates without leaving a dangling separator, and `fallback` is returned when nothing survives (a pure-CJK input slugs to `''`). |

Replaced the `slugify` npm package, which kept apostrophes and dots (`Amelie’s Chocolate Inc.` → `amelie's-chocolate-inc.`).

### `@byelabel/react` (frontend only)

`useClipboard` `useCountdown` `useDebounceEffect` `useDebouncedValue` `useInterval` `useIsInit` `useIsMobile` `useIsomorphicLayoutEffect` `useMounted` `useScript` `useTable` `useTabs` `useTimeout`; `AppContext`; `utils/color`. Subpaths `/hooks`, `/contexts`, `/utils`, `/color`. ESM, React ≥18 peer.

---

## Conventions this library imposes

**1. The `{ error, payload }` envelope.** Nothing throws across a service boundary. A handler returns `eventResult(...)` → `IEventResult`; `sendMessageForReply` resolves that same object. Callers **must** check `error` explicitly — the promise resolves on failure:

```ts
const { error, payload } = await sendMessageForReply('workspace.list', { params });
if (error) throwAppError(error.message, error.code, error.args);
```

Express edges use the parallel `toResponse`/`responseData` shape (`{ success, payload | error, transaction }`).

**2. Money is stored in minor units.** Integers in the DB, `toMinor` on the way in, `toMajor`/`display(v, { minor: true })` on the way out. `number.currency` is for values already in major units.

**3. Filter / sort / pagination wire shape.** Every list endpoint takes the same object, validated with `JoiFilter`-built schemas and compiled with `filtering`:

```jsonc
{
  "filter": { "and": [ ["created_at", "between", ["2026-01-01", "2026-02-01"]],
                       { "or": [ ["status", "equals", "failed"] ] } ] },
  "sort":   [ ["created_at", "desc"] ],
  "last_id": "…uuid or pid…",     // getInfiniteList
  "limit":  20                     // capped at 1000
}
```
Offset lists return `IList` (`total.all` / `total.filtered`); cursor lists return `IInfiniteList` where `more` is the number of rows left.

**4. Soft-delete sentinel.** `deleted_at` is `TIMESTAMPTZ NOT NULL DEFAULT 0` — the **epoch, not NULL**. Live rows are `deleted_at = TO_TIMESTAMP(0)` (`{ [Op.eq]: 0 }` in Sequelize); deleting is `UPDATE … SET deleted_at = NOW()`. Models express this as a `@Scopes` `default` and override the static `scope()` so `default` is always applied.

**5. `pid` vs `id`.** Every table has a `BIGINT` autoincrement `pid` (internal, the FK target and the pagination cursor) and a `UUID` `id` (external). Never expose `pid`; `dataModel` maps `pid` → `id` for tables that have no UUID (the log tables).

**6. Audit trail.** Mutating models fire `sendMessage('log.query', { user_id, table, action, row_id, data })` from `@AfterCreate`/`@AfterUpdate`/`@AfterUpsert`, reading `options.user_id` / `options.action` passed through the Sequelize call options (`IQueryAction`).

---

## Gotchas

- **Import order matters.** `@byelabel/utils/config` must be imported before anything that reads `process.env` at module scope — which includes every model's `tableName` and the `db`/`rabbit`/`redis` config readers.
- **Per-PID singletons.** `db`, `rabbit`, `redis` and `eventEmitter` are all keyed by `process.pid` and captured **at module load**. They are correct under `cluster.fork()` (a fresh module registry per worker) but a forked child that inherits a warm module cache would share the parent's handle.
- **`sequelize` is a function, not a value.** `db.sequelize().query(...)`. It returns `undefined` before `db.connect()` resolves.
- **`throwAppError` returns `void`.** TypeScript does not treat it as `never`, so control flow is not narrowed after a call — hence the `subscription!` non-null assertions all over the services.
- **`isObject` is plain objects only**; use `isObjectLike` for dates/arrays/errors. **`isNonNullObject` requires at least one key** — `{}` is false, which quietly changes behaviour for empty payloads.
- **`filtering` interpolates values into raw SQL** (via `escapeString`) rather than binding them. It is only safe because column names and operators are whitelisted by the `JoiFilter` schema upstream. **Never** pass an unvalidated filter to it.
- **`getList`'s `sqlBody` is invoked three times** with different flags. A `sqlBody` that ignores `withColumns`/`onlyDefaults` produces a wrong `total.all` or a count query that selects columns.
- **`getInfiniteList` requires the `n` column**; forgetting `ROW_NUMBER() OVER (…) AS "n"` fails at runtime, not compile time. `usePid: true` also changes the cursor column to `pid` and the validity check to numeric.
- **`receiveMessage` acks on error.** A handler that throws loses the message — there is no DLQ. Persist before you can fail.
- **`sendMessageForReply` resolves the envelope, not the payload.** `const payload = await sendMessageForReply(...)` gives you `{ error, payload, events }`.
- **RPC timeout defaults differ**: 60 s for replies, 30 s for stream chunk queues, both from `RABBIT_TIMEOUT` when it is non-zero.
- **`createToken` / `createKey` use `Math.random`.** They back `whsec_…` webhook secrets and OTP-style keys; `createRandomHash` is the CSPRNG one.
- **`createHash(x, 'md5', secret)` silently ignores `secret`.** Only the `sha256` branch is keyed.
- **`writeToFile` is synchronous** and every `log*` call goes through it — a hot error path blocks the event loop and grows `logs/` unbounded (there is no rotation; see the ~150 files already in `logging/logs/`).
- **`runJobs` executes job functions in a `node:vm` context.** Only `logError` and the extra `args` are in scope; a stack trace from inside a job points at a synthesized script.
- **Not linked locally** — editing `helpers/` changes nothing in a service until the package is released and the service's `@byelabel/utils` range is refreshed.
