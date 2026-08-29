# ByeLabel Packages

A pnpm-workspace monorepo with two publishable packages:

| Package | Description |
| --- | --- |
| [`@byelabel/utils`](#byelabelutils) | Server-side helpers: validators, error/log/data shapes, encryption, Sequelize/RabbitMQ/Redis bindings. |
| [`@byelabel/react`](#byelabelreact) | Client-side React hooks and a tiny generic context. Zero non-React deps. |

## Workspace scripts

```bash
pnpm build         # build every package in parallel
pnpm test          # run vitest in every package
pnpm test:watch    # watch mode in every package
pnpm clean         # remove build/ and node_modules/ across packages
pnpm release       # version, tag and publish to npm (see Publishing)
```

Single-package commands use the `--filter` flag:

```bash
pnpm --filter @byelabel/utils run build
pnpm --filter @byelabel/react test
```

---

## `@byelabel/utils`

```bash
pnpm add @byelabel/utils
```

Subpath imports are tree-shakable:

```ts
import { isUUID } from '@byelabel/utils/validator';
import { AppError, throwAppError } from '@byelabel/utils/error';
import { logError } from '@byelabel/utils/log';
```

The flat barrel (`@byelabel/utils`) re-exports everything. Modules whose names collide on `connect` / `disconnect` (`db`, `rabbit`, `redis`) are exposed as namespaces:

```ts
import { db, rabbit, redis, AppError, isUUID } from '@byelabel/utils';

await db.connect();
await rabbit.connect();
await redis.connect();
```

### `@byelabel/utils/validator`

Type guards for runtime shape checks. All return `boolean`.

| Function | True when... |
| --- | --- |
| `isBuffer(v)` | `v instanceof Buffer` |
| `isSymbol(v)` | typeof symbol |
| `isUndefined(v)` | undefined |
| `isNull(v)` | null |
| `isArray(v)` | array |
| `isNonEmptyArray(v)` | array with at least one item |
| `isBoolean(v)` | boolean |
| `isNumber(v)` | typeof number (does not include numeric strings) |
| `isInteger(v)` | numeric and integer |
| `isNumeric(v)` | number or numeric string (`NaN` is not numeric) |
| `isString(v)` | string |
| `isNonEmptyString(v)` | string and not `''` |
| `isObject(v)` | plain object |
| `isNonNullObject(v)` | plain object with at least one key |
| `isEmpty(v)` / `isNotEmpty(v)` | empty by any of the above |
| `isFunction(v)` | function or async function |
| `isAsyncFunction(v)` | async function |
| `isUUID(v)` | valid UUID string |
| `isEmail(v)` | matches `x@y` |
| `isPhoneNumber(v)` | matches a flexible international format |
| `isURL(v)` | parseable `http(s)://...` URL |
| `isTCNumber(v)` | valid Turkish national ID (11-digit, checksum) |

```ts
import { isUUID, isEmail, isNonEmptyArray } from '@byelabel/utils/validator';

isUUID('00000000-0000-4000-8000-000000000000'); // true
isEmail('hi@example.com');                       // true
isNonEmptyArray([1, 2, 3]);                      // true
```

### `@byelabel/utils/error`

```ts
import { AppError, ResponseError, throwAppError, getErrorString } from '@byelabel/utils/error';

throw new AppError('Resource not found', 'NOT_FOUND', { id: '123' });

// auto-derives a code from the message
throw new AppError('Invalid token');           // code: 'INVALID_TOKEN'

// HTTP-flavored error
throw new ResponseError('Forbidden', 403);

// helper
throwAppError('Bad input', 'VALIDATION_ERROR', { field: 'email' });

// formatted "{message} - [{func} @ {file}:{line}:{col}]"
console.log(getErrorString(new Error('boom')));
```

### `@byelabel/utils/data`

```ts
import { paging, toResult, IList, IInfiniteList } from '@byelabel/utils/data';

paging(100);              // { offset: 0, limit: 20, total: 100 }
paging(50, 100, 10);      // { offset: 0, limit: 10, total: 50 } (offset clamped)
paging(5000, 0, 5000);    // { offset: 0, limit: 1000, total: 5000 } (limit capped)

toResult(undefined, { id: 1 });   // { success: true, payload: { id: 1 } }
toResult(new AppError('boom'));   // { success: false, error }
toResult(new Error('boom'));      // wraps as AppError('SYSTEM_ERROR')
```

### `@byelabel/utils/crypt`

```ts
import {
  createHash, comparePassword, createRandomHash, createKey,
  createToken, getRandomNumber, createSimpleHash
} from '@byelabel/utils/crypt';

createHash('hello');                     // HMAC-SHA256, secret = process.env.TOKEN_SECRET
createHash('hello', 'md5');              // simple md5
createHash('hello', 'sha256', 'mySec');  // explicit secret

comparePassword(savedHash, plain);       // boolean
createRandomHash(80);                    // hex string of length 80
createKey(6);                            // 6-digit numeric token, e.g. '482913'
createToken(5);                          // 5-char alphanumeric, e.g. 'A2K9F'
getRandomNumber(1, 100);                 // inclusive integer in [1, 100]
```

### `@byelabel/utils/encryption`

AES-256-GCM with auth tag, IV-prefixed binary output.

```ts
import { getKey, encrypt, decrypt } from '@byelabel/utils/encryption';

const key = getKey('my-password', 'my-salt');
const ciphertext = encrypt('secret message', key);   // Buffer
const plaintext  = decrypt(ciphertext, key);         // 'secret message'
```

### `@byelabel/utils/log`

File-rotated logging into `${ROOT_PATH}/${LOGS_PATH || 'logs'}/YYYY-MM-DD-{type}.log` (UTC). Optional admin-email digest via `sendMessage('message.send', ...)` to the rabbit queue when `SEND_LOGS=true`.

```ts
import { logInfo, logWarning, logError, writeToFile, showMessages } from '@byelabel/utils/log';

await logInfo('app started');
await logWarning('cache miss', true);          // also console.log
await logError('Login failed', err, { userId });

writeToFile('boot complete', 'info');          // sync write, returns { path, name, fullPath }

showMessages([
  'PORT  : 3000',
  'NODE  : 20.x'
]);
```

### `@byelabel/utils/number`

Number formatting helpers built on `Intl.NumberFormat`, plus shipping unit converters (`toLb`, `toOz`, `toKg`, `toGr`, `toIn`, `toCm`). Exposed flat (`toNumber`, `formatBytes`, `getRandom`, ...) and namespaced (`number.format`, `number.currency`, `number.short`, `number.percent`) — the namespace form is recommended for the generic names. The formatter functions take a single human-readable options object (no raw `Intl.NumberFormatOptions` pass-through).

```ts
import { number, toNumber, formatBytes, getRandom } from '@byelabel/utils';
// or: import * as number from '@byelabel/utils/number';

toNumber('1.236', 2);                                      // 1.24 (rounded to 2 dp)
toNumber('abc');                                           // 0 (non-numeric → 0)

number.format(1234567.89);                                 // '1,234,567.89'
number.format(1234.5, { locale: 'tr-TR' });                // '1.234,5'
number.format(1.5, { decimals: 3 });                       // '1.500'
number.format(1234567.89, { grouping: false });            // '1234567.89'

number.currency(1234.5);                                   // '$1,234.50'
number.currency(10, 'EUR', { locale: 'en-US' });           // '€10.00'
number.currency(10.5, 'USD', { decimals: false });         // '$11'
number.currency(10.5, 'USD', { symbol: false });           // '10.50'
number.currencySymbol('GBP', { locale: 'en-US' });         // '£'

number.percent(25, { locale: 'en-US' });                   // '25%'   (input is already a percentage)
number.percent(25.5, { decimals: 2 });                     // '25.50%'

number.short(1500);                                        // '1.5K'
number.short(2_500_000);                                   // '2.5M'
number.short(1500, { long: true });                        // '1.5 thousand'
number.short(1234, { decimals: 2 });                       // '1.23K'

getRandom(1, 10);                                          // integer in [1, 10] inclusive

formatBytes(2048);                                         // '2.0 KB'
formatBytes(5 * 1024 * 1024);                              // '5.0 MB'

// weight converters — (value, unit: 'lb' | 'oz' | 'kg' | 'gr')
toLb(1, 'kg');                                             // 2.2
toOz(1, 'lb');                                             // 16
toKg(16, 'oz');                                            // 0.454
toGr(0.5, 'kg');                                           // 500
toLb('abc' as any, 'kg');                                  // 0 (non-numeric → 0)

// dimension converters — (value, unit: 'in' | 'cm')
toIn(2.54, 'cm');                                          // 1
toCm(1, 'in');                                             // 2.5
toIn(0, 'in');                                             // 0 (zero/non-numeric → 0)
```

Options accepted by each formatter:

| Function | Options |
| --- | --- |
| `format(n, options?)` | `locale`, `decimals` (exact fraction digits), `grouping` (default `true`) |
| `currency(n, code?, options?)` | `locale`, `decimals` (default `true` — currency-natural digits; `false` forces 0), `symbol` (default `true`) |
| `currencySymbol(code?, options?)` | `locale` |
| `percent(n, options?)` | `locale`, `decimals` (exact fraction digits) |
| `short(n, options?)` | `locale`, `decimals` (max fraction digits, default `1`), `long` (long compact display, default `false`) |

Unit converters for shipping weights and dimensions. All converters take `(value, unit)` — weight units are `'lb' | 'oz' | 'kg' | 'gr'`, dimension units are `'in' | 'cm'` (`WeightUnit` / `LengthUnit` types are exported). Zero, missing, or non-numeric values fall back to `0`. Numeric strings are accepted everywhere.

| Function | Returns | Rounding |
| --- | --- | --- |
| `toLb(value, unit)` | pounds | 2 dp |
| `toOz(value, unit)` | ounces | 2 dp |
| `toKg(value, unit)` | kilograms | 3 dp |
| `toGr(value, unit)` | grams | 1 dp |
| `toIn(value, unit)` | inches | 2 dp |
| `toCm(value, unit)` | centimeters | 1 dp |

### `@byelabel/utils/money`

Currency-aware money formatting with built-in zero/three-decimal currency tables (e.g. JPY/KRW have 0, KWD/BHD have 3) and minor-unit (cents) conversion. Exposed flat (`display`, `toMinor`, `toMajor`, ...) and namespaced (`money.display`, ...) — the formatter is `display` instead of `format` to avoid colliding with `number.format` at the root.

```ts
import { display, toMajor, toMinor } from '@byelabel/utils/money';
// or: import { money } from '@byelabel/utils';

display(1234.5);                                  // '$1,234.50'
display(1500, { currency: 'JPY' });                   // '¥1,500'   (zero-decimal)
display(1.234, { currency: 'KWD', locale: 'en-US' }); // 'KWD 1.234' (three-decimal)
display(1234.5, { currency: 'EUR', locale: 'de-DE' });// '1.234,50 €'

display(1050, { minor: true });                   // '$10.50'   (1050 cents → $10.50)
display(10.5, { decimals: false });               // '$11'      (suppress fraction digits)
display(10.5, { symbol: false });                 // '10.50'    (no currency symbol)

toMinor(10.5);                                    // 1050   (USD → cents)
toMinor(1.234, 'KWD');                            // 1234   (3 decimals)
toMinor(1500, 'JPY');                             // 1500   (0 decimals, no scale)

toMajor(1050);                                    // 10.5
toMajor(1234, 'KWD');                             // 1.234

money.getCurrencyDecimals('USD');                 // 2
money.getCurrencyDecimals('JPY');                 // 0
money.getCurrencyDecimals('KWD');                 // 3

money.isZeroDecimalCurrency('JPY');               // true
money.isZeroDecimalCurrency('USD');               // false
```

`display` accepts `MoneyDisplayOptions`:

| Option | Default | Notes |
| --- | --- | --- |
| `currency` | `'USD'` | ISO 4217 currency code |
| `locale` | `'en-US'` | BCP 47 locale tag |
| `minor` | `false` | Treat input as minor units (cents) and convert before formatting |
| `decimals` | `true` | When `false`, fraction digits are forced to 0 |
| `symbol` | `true` | When `false`, formats as plain decimal without the currency symbol |

### `@byelabel/utils/dto`

Joi schema validation + a generic data-mapping wrapper.

```ts
import { validateSchema, phoneNumberValidation } from '@byelabel/utils/dto';
import joi from 'joi';

const schema = joi.object({ email: joi.string().email().required() });

// sync — throws AppError('VALIDATION_ERROR') with details
const value = validateSchema(schema, { email: 'a@b.co' });

// async
const value2 = await validateSchema(schema, { email: 'a@b.co' }, true);

// custom Joi rule
joi.string().custom(phoneNumberValidation);
```

### `@byelabel/utils/db`

Sequelize wrapper with reconnection, replica support, and a typed filter/sort/paginate DSL.

```ts
import { db } from '@byelabel/utils';
// or: import * as db from '@byelabel/utils/db';

await db.connect();                                      // env-only
await db.connect({ name: 'analytics', debug: true });    // override per-field
const sequelize = db.sequelize();

// validate config without connecting (throws AppError if host/name/user missing)
db.checkDbConfig();
db.checkDbConfig({ host: 'db.local', name: 'app', user: 'app' });

// safe SQL string
db.escapeString("o'reilly", true);   // "'o''reilly'"

// build a WHERE from a structured filter
const where = await db.filtering([
  ['email', 'contains', 'gmail'],
  ['status', 'isAnyOf', ['active', 'pending']]
]);

// Joi schema for user-supplied filter input
const schema = db.JoiFilter('email', 'string');

// paginated list
const page = await db.getList<User>({
  offset: 0,
  limit: 20,
  sqlBody: async (alias, withColumns) => `SELECT ... FROM users AS "${alias}"`,
  dataModel: rows => rows
});

await db.disconnect();
```

`connect(options?)` and `checkDbConfig(options?)` accept an optional `IDbOptions`:

| Option | Env fallback | Default |
| --- | --- | --- |
| `engine` | `DB_ENGINE` | `'postgresql'` |
| `host` | `DB_HOST` | — (required) |
| `port` | `DB_PORT` | `5432` |
| `name` | `DB_NAME` | — (required) |
| `user` | `DB_USER` | — (required) |
| `pass` | `DB_PASS` | `''` |
| `useSsl` | `DB_USE_SSL === 'true'` | `false` |
| `prefix` | `DB_PREFIX` | — |
| `skipSync` | `DB_SKIP_SYNC === 'true'` | `false` |
| `forceSync` | `DB_FORCE_SYNC === 'true'` | `false` |
| `debug` | `DB_DEBUG === 'true'` | `false` |

`checkDbConfig` throws `AppError` (`MISSING_DB_HOST`, `MISSING_DB_NAME`, `MISSING_DB_USER`) when a required field is missing. Comma-separate `host`/`port`/`user`/`pass` for read replicas.

### `@byelabel/utils/rabbit`

RabbitMQ client with auto-reconnect (bounded retry-with-backoff), AMQP heartbeats, message streaming for payloads larger than `messageMaxSize` (default 5 MB), request/response over reply queues, and open-ended `Readable` replies via `sendMessageForReplyStream` for piping large payloads to clients without buffering.

```ts
import { rabbit } from '@byelabel/utils';

await rabbit.connect();                                            // env-only
await rabbit.connect({ host: 'mq.local', namespace: 'svc' });      // override per-field

// validate config without connecting (throws AppError if host missing)
rabbit.checkRabbitConfig();

// fire-and-forget
await rabbit.sendMessage('log.event', { action: 'login', user_id: id });

// request → reply
const result = await rabbit.sendMessageForReply('account.find', { id });

// request → streaming reply (Readable arrives as soon as the first chunk lands)
const pdf = await rabbit.sendMessageForReplyStream('file.download', { id });
pdf.pipe(res);

// listen
await rabbit.receiveMessage('account', async (params) => {
  return { success: true, payload: { /* ... */ } };
});

// listen + reply with a Readable (chunks are sent as they flow)
await rabbit.receiveMessage('file', async (params) => {
  return { payload: fs.createReadStream(`/storage/${params.id}.pdf`) };
});

// via the eventEmitter — payload can be a regular value or a Readable
eventEmitter.on('file.download', (params, reply) => {
  reply(null, fs.createReadStream(`/storage/${params.id}.pdf`));
});

// pub/sub
await rabbit.publishMessage('user', 'updated', { id });
await rabbit.receivePublishedMessage('user', '*', payload => { /* ... */ });

// hook all queues + exchanges to the eventEmitter
await rabbit.listen(true);
```

`connect(options?)` and `checkRabbitConfig(options?)` accept an optional `IRabbitOptions`:

| Option | Env fallback | Default |
| --- | --- | --- |
| `name` | `RABBIT_NAME` | `process.env.NAME` → `'microservice'` |
| `protocol` | `RABBIT_PROTOCOL` | `'amqp'` |
| `host` | `RABBIT_HOST` | — (required) |
| `port` | `RABBIT_PORT` | `5672` |
| `user` | `RABBIT_USER` | — |
| `pass` | `RABBIT_PASS` | — |
| `vhost` | `RABBIT_VHOST` | — |
| `namespace` | `RABBIT_NAMESPACE` | — |
| `messageMaxSize` | `RABBIT_MESSAGE_MAX_SIZE` | `5000000` |
| `prefetch` | `RABBIT_PREFETCH` | `10` (per-consumer cap on unacked deliveries; `0` = unlimited) |
| `timeout` | `RABBIT_TIMEOUT` | `30`/`60` (per call) |
| `queues` | `RABBIT_QUEUES` | — (used by `listen`) |
| `exchanges` | `RABBIT_EXCHANGES` | — (used by `listen`) |
| `heartbeat` | `RABBIT_HEARTBEAT` | `60` (seconds; `0` disables) |
| `keepAlive` | `RABBIT_KEEP_ALIVE` | `true` (set `RABBIT_KEEP_ALIVE=false` to disable TCP keepalive) |
| `keepAliveDelay` | `RABBIT_KEEP_ALIVE_DELAY` | `10000` (ms; idle time before kernel sends keepalive probes) |
| `maxRetries` | `RABBIT_MAX_RETRIES` | `10` (max connect attempts) |
| `retryDelay` | `RABBIT_RETRY_DELAY` | `500` (ms; initial backoff, doubles per attempt) |
| `retryMaxDelay` | `RABBIT_RETRY_MAX_DELAY` | `5000` (ms; backoff cap) |

The connection name advertised to RabbitMQ is `${name}-${pid}` — `name` is taken from the `name` option, falling back to `RABBIT_NAME`, then `process.env.NAME`, then `'microservice'`. Each service shows up identifiable in the broker's connections view.

Queue consumers (`receiveMessage` / `listen`) use manual acks: a message is acked after its handler settles, so `prefetch` bounds how many messages each worker processes concurrently — slow handlers apply backpressure instead of buffering the whole queue in memory. Handler errors are logged and the message is still acked (consumed once, no requeue loop); if a worker dies mid-handler, its unacked messages are redelivered.

`checkRabbitConfig` throws `AppError('MISSING_RABBIT_HOST')` when host is missing.

### `@byelabel/utils/redis`

```ts
import { redis } from '@byelabel/utils';

const client = await redis.connect();                                  // env-only
const client2 = await redis.connect({ host: 'cache.local', db: 1 });   // override

// validate config without connecting (throws AppError if host missing)
redis.checkRedisConfig();

await client.set('key', 'value');
await redis.disconnect();
```

`connect(options?)` and `checkRedisConfig(options?)` accept an optional `IRedisOptions`:

| Option | Env fallback |
| --- | --- |
| `host` | `REDIS_HOST` (required) |
| `port` | `REDIS_PORT` |
| `user` | `REDIS_USER` |
| `pass` | `REDIS_PASS` |
| `db` | `REDIS_DB` |

`checkRedisConfig` throws `AppError('MISSING_REDIS_HOST')` when host is missing. Comma-separate `host`/`port`/`user`/`pass` to enable cluster mode.

### `@byelabel/utils/events`

Singleton wildcard `EventEmitter2` plus an `attachEvents` helper that wires `events/**/*.js` files at a path.

```ts
import eventEmitter, { attachEvents, eventResult } from '@byelabel/utils/events';

eventEmitter.on('user.created', (payload, cb) => {
  cb(null, { id: payload.id });
});

await attachEvents(__dirname);   // loads ./events/*.js based on EVENTS env
```

### `@byelabel/utils/jobs`

Loads `jobs/**/*.js` and runs each export inside a fresh `vm` context.

```ts
import { runJobs } from '@byelabel/utils/jobs';

await runJobs(__dirname, { db, rabbit });
```

Filter set via `JOBS=*` or `JOBS=foo,bar.run`.

### `@byelabel/utils/output`

Express middleware helper. Wraps a callback into a structured `{ success, payload | error, transaction }` response, with optional rabbit logging on `LOG=request,response`.

```ts
import { toResponse, responseData, IRequest } from '@byelabel/utils/output';

app.post('/login', (req, res) => {
  toResponse(req, res, async (transactionId) => {
    return { token: '...' };
  });
});

// manual shape
res.json(responseData(null, { token: '...' }));
```

### `@byelabel/utils/config`

Works in **both Node and the browser**. In Node it autoloads `.env` from `process.cwd()` and sets `process.env.WORKING_PATH`, `ROOT_PATH`, normalized `ROUTE_PREFIX`. In the browser the autoload is skipped (no filesystem) — `loadEnv` returns empty paths and reads `ROUTE_PREFIX` from whatever the bundler exposes.

```ts
import { loadEnv } from '@byelabel/utils/config';

// Node — read .env from cwd
const { rootPath, workingPath, routePrefix } = loadEnv();

// Node — named env file
loadEnv('.env.staging');

// Browser (Vite) — pass bundler-inlined envs
loadEnv('.env', { vars: import.meta.env });

// Anywhere — explicit override (file values still win in Node when both are present)
loadEnv('.env', { vars: { ROUTE_PREFIX: '/api/v1' } });
```

`ROUTE_PREFIX` is normalized: leading/trailing slashes are trimmed and collapsed, then a single leading `/` is added (`api/v1/` → `/api/v1`, `///` → `''`). In the browser, `rootPath` and `workingPath` are always `''` — they have no meaning outside Node.

---

## `@byelabel/react`

```bash
pnpm add @byelabel/react react react-dom
```

ESM only. React 18+ peer.

```ts
import { useDebouncedValue, useTimeout } from '@byelabel/react/hooks';
import { AppProvider, useAppContext } from '@byelabel/react/contexts';
import { stringToColor, hexToRGBA, shader } from '@byelabel/react/color';
// or flat barrel:
import { useDebouncedValue, AppProvider, stringToColor } from '@byelabel/react';
```

### Hooks

#### `useDebouncedValue<T>(value, delay = 300): T`

```tsx
const debounced = useDebouncedValue(query, 300);

useEffect(() => {
  fetchResults(debounced);
}, [debounced]);
```

#### `useDebounceEffect(fn, waitTime, deps)`

`useEffect` with a debounce. Runs `fn(...deps)` after `waitTime` ms of stillness.

```tsx
useDebounceEffect(([q]) => {
  search(q);
}, 250, [query]);
```

#### `useTimeout(callback, delay | null)`

Setup a one-shot timer that uses the latest `callback`. Pass `null` to pause.

```tsx
useTimeout(() => setVisible(false), open ? 3000 : null);
```

#### `useInterval(callback, delay | null)`

Same as `useTimeout` but recurring.

```tsx
useInterval(() => refetch(), 5000);
```

#### `useIsomorphicLayoutEffect`

`useLayoutEffect` in browsers, `useEffect` during SSR.

```tsx
useIsomorphicLayoutEffect(() => measureLayout(), [size]);
```

#### `useMounted(): () => boolean`

```tsx
const isMounted = useMounted();
fetch('/x').then(r => { if (isMounted()) setData(r); });
```

#### `useIsInit(): boolean`

`true` on first render, `false` thereafter.

```tsx
if (useIsInit()) {
  console.log('first paint');
}
```

#### `useIsMobile(): boolean`

Tracks `window.innerWidth < 768` via `matchMedia`.

```tsx
const isMobile = useIsMobile();
return isMobile ? <MobileNav/> : <DesktopNav/>;
```

#### `useCountdown(date)`

```tsx
const { days, hours, minutes, seconds } = useCountdown('2026-12-31T23:59:59Z');
```

#### `useScript(src, options?): 'idle' | 'loading' | 'ready' | 'error'`

Inject a `<script>` tag once and watch its load state.

```tsx
const status = useScript('https://js.stripe.com/v3/', { position: 'head-end' });
if (status === 'ready') initStripe();
```

#### `useTabs<T>(defaultTab)`

```tsx
const { currentTab, setCurrentTab, onChangeTab } = useTabs(0);

<Tabs value={currentTab} onChange={onChangeTab}>...</Tabs>
```

#### `useTable(props?)`

Table state for sort/paginate/select. Plus three pure helpers: `descendingComparator`, `getComparator`, `emptyRows`.

```tsx
const t = useTable({ defaultOrderBy: 'created_at', defaultRowsPerPage: 10 });

const sorted = [...rows].sort(getComparator<Row>(t.order, 'created_at'));
const empty  = emptyRows(t.page, t.rowsPerPage, rows.length);
```

### Contexts

#### `AppProvider<T>` / `useAppContext<T>()`

Generic state container — useful as a building block when you don't need a reducer.

```tsx
import { AppProvider, useAppContext } from '@byelabel/react/contexts';

type State = { count: number };

function Counter() {
  const { state, setState } = useAppContext<State>();

  return (
    <button onClick={() => setState({ count: state.count + 1 })}>
      {state.count}
    </button>
  );
}

export default function App() {
  return (
    <AppProvider initial={{ count: 0 }}>
      <Counter/>
    </AppProvider>
  );
}
```

`useAppContext` throws if used outside `<AppProvider>`.

### Color utilities

Pure functions for working with hex colors. Framework-agnostic — usable outside React.

#### `stringToColor(str): string`

Deterministic hex color derived from any string. Useful for avatar backgrounds, tag chips, or any "stable color per identifier" UI.

```ts
const bg = stringToColor(user.email); // e.g. '#3F8AC2'

<Avatar style={{ backgroundColor: bg }}>{user.initials}</Avatar>
```

#### `hexToRGBA(hex, opacity): string`

Converts a 3- or 6-digit hex (with or without `#`) to a CSS `rgba()` string.

```ts
hexToRGBA('#FF8800', 0.5); // 'rgba(255, 136, 0, 0.5)'
hexToRGBA('0F0', 0.25);    // 'rgba(0, 255, 0, 0.25)'

<div style={{ boxShadow: `0 4px 12px ${hexToRGBA(theme.primary, 0.25)}` }} />
```

#### `shader(hex, percent?): string`

Lightens (`percent > 0`) or darkens (`percent < 0`) a 6-digit hex color. Channels are clamped to 255. Defaults to `0` (no-op).

```ts
shader('#336699',  50); // '#4c99e5' — 50% lighter
shader('#336699', -50); // '#19334c' — 50% darker
shader('#FFFFFF',  50); // '#ffffff' — clamped
```

---

## Local development

```bash
pnpm install
pnpm build
pnpm test
```

Each package has its own `vitest.config.ts` (`node` for utils, `jsdom` for react). Test files (`*.test.ts`, `*.test.tsx`) live alongside source and are excluded from the published `build/`.

## Publishing

One command does the whole release — pick the version, write the CHANGELOG,
build, test, commit, tag, push:

```bash
pnpm release
```

With no arguments it releases **every package that has unreleased commits**, and
picks each new version automatically from the [Conventional Commits](https://www.conventionalcommits.org/)
touching that package since its last tag:

| Commits since the last tag | Bump |
| --- | --- |
| `feat!:` / `BREAKING CHANGE:` in the body | major (minor while the package is `0.x`) |
| `feat:` | minor |
| anything else (`fix:`, `refactor:`, `chore:`, …) | patch |
| none | package is skipped |

It prints the plan and waits for confirmation before anything is written:

```
Release plan:

  @byelabel/utils  3.0.1 -> 3.1.0   (minor (from 4 commits))
  tag: utils-v3.1.0
    - feat(db): add trimSql
    - fix(rabbit): reconnect on channel close

Publish to npm? [y/N]
```

### Targeting a package or version

```bash
pnpm release utils              # only utils, bump inferred
pnpm release utils minor        # force the bump level
pnpm release utils 3.2.0        # force the exact version
pnpm release all                # both packages, even the unchanged one
pnpm release:utils              # alias for `pnpm release utils`
pnpm release:react              # alias for `pnpm release react`
```

### Flags

| Flag | Effect |
| --- | --- |
| `--dry-run` | print the plan and stop — nothing written, built or pushed |
| `--edit` | open `$EDITOR` on the generated CHANGELOG entry first |
| `--no-changelog` | skip the CHANGELOG entirely |
| `--skip-checks` | do not build/test before tagging |
| `--no-push` | commit and tag locally, push by hand |
| `-y`, `--yes` | skip the confirmation prompt (implied when not a TTY) |

Start with `pnpm release --dry-run` if you want to see the plan without committing to it.

### What happens after the push

The script pushes `<pkg>-v<version>` (e.g. `utils-v3.1.0`), and
[`.github/workflows/publish.yml`](.github/workflows/publish.yml) takes it from
there: install, build, test, then `pnpm publish --access public --provenance` to
npmjs.com. Auth is **trusted publishing** (OIDC) — there is no `NPM_TOKEN`, so
each package needs a trusted publisher registered on npmjs.com pointing at
`repo=byelabel/helpers`, `workflow=publish.yml`. Watch the run at
[Actions → publish](https://github.com/byelabel/helpers/actions/workflows/publish.yml).

A release can also be triggered straight from the Actions tab
(`workflow_dispatch`) to re-publish the current version without a new tag.

### Guard rails

The script refuses to run when the working tree is dirty, when you are not on
`master`/`main`, when the tag already exists, or when the requested version is
lower than the current one. If `package.json` was bumped by hand and never
tagged, that version is released as-is rather than bumped again.

### Publishing by hand

Rarely needed — this skips CI, and npm provenance with it:

```bash
cd packages/utils && pnpm publish --access public
```

`prepublishOnly` runs the build first. `publint` is recommended before a release:

```bash
pnpx publint packages/utils
pnpx publint packages/react
```
