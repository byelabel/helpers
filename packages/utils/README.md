# @byelabel/utils

Server-side helpers: validators, error/log/data shapes, encryption, Sequelize/RabbitMQ/Redis bindings.

```bash
pnpm add @byelabel/utils
# or
npm install @byelabel/utils
```

## Imports

Subpath imports are tree-shakable and recommended:

```ts
import { isUUID } from '@byelabel/utils/validator';
import { AppError, throwAppError } from '@byelabel/utils/error';
import { logError } from '@byelabel/utils/log';
```

The flat barrel re-exports everything. Modules whose names collide on `connect` / `disconnect` (`db`, `rabbit`, `redis`) are exposed as namespaces:

```ts
import { db, rabbit, redis, AppError, isUUID } from '@byelabel/utils';

await db.connect();
await rabbit.connect();
await redis.connect();
```

## Modules

### `validator`

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
| `isNumeric(v)` | number or numeric string |
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

### `error`

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

### `data`

```ts
import { paging, toResult, IList, IInfiniteList } from '@byelabel/utils/data';

paging(100);              // { offset: 0, limit: 20, total: 100 }
paging(50, 100, 10);      // { offset: 0, limit: 10, total: 50 } (offset clamped)
paging(5000, 0, 5000);    // { offset: 0, limit: 1000, total: 5000 } (limit capped)

toResult(undefined, { id: 1 });   // { success: true, payload: { id: 1 } }
toResult(new AppError('boom'));   // { success: false, error }
toResult(new Error('boom'));      // wraps as AppError('SYSTEM_ERROR')
```

### `crypt`

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

### `encryption`

AES-256-GCM with auth tag, IV-prefixed binary output.

```ts
import { getKey, encrypt, decrypt } from '@byelabel/utils/encryption';

const key = getKey('my-password', 'my-salt');
const ciphertext = encrypt('secret message', key);   // Buffer
const plaintext  = decrypt(ciphertext, key);         // 'secret message'
```

### `log`

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

### `number`

Number formatting helpers built on `Intl.NumberFormat`. Exposed flat (`toNumber`, `formatBytes`, `getRandom`, ...) and namespaced (`number.format`, `number.currency`, `number.short`, `number.percent`) — the namespace form is recommended for the generic names.

```ts
import { number, toNumber, formatBytes, getRandom } from '@byelabel/utils';
// or: import * as number from '@byelabel/utils/number';

toNumber('1.236', 2);                   // 1.24 (rounded to 2 dp)
toNumber('abc');                        // 0 (non-numeric → 0)

number.format(1234567.89);              // '1,234,567.89'
number.format(1234.5, undefined, 'tr-TR'); // '1.234,5'
number.format(1.5, { minimumFractionDigits: 3 }); // '1.500'

number.currency(1234.5);                // '$1,234.50'
number.currency(10, 'EUR', 'en-US');    // '€10.00'
number.currencySymbol('GBP', 'en-US');  // '£'

number.percent(25, 'en-US');            // '25%'  (input is already a percentage)

number.short(1500);                     // '1.5K'
number.short(2_500_000);                // '2.5M'

getRandom(1, 10);                       // integer in [1, 10] inclusive

formatBytes(2048);                      // '2.0 KB'
formatBytes(5 * 1024 * 1024);           // '5.0 MB'
```

### `dto`

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

### `db`

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

### `rabbit`

RabbitMQ client with auto-reconnect, message streaming for payloads larger than `messageMaxSize` (default 5 MB), and request/response over reply queues.

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

// listen
await rabbit.receiveMessage('account', async (params) => {
  return { success: true, payload: { /* ... */ } };
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
| `protocol` | `RABBIT_PROTOCOL` | `'amqp'` |
| `host` | `RABBIT_HOST` | — (required) |
| `port` | `RABBIT_PORT` | `5672` |
| `user` | `RABBIT_USER` | — |
| `pass` | `RABBIT_PASS` | — |
| `vhost` | `RABBIT_VHOST` | — |
| `namespace` | `RABBIT_NAMESPACE` | — |
| `messageMaxSize` | `RABBIT_MESSAGE_MAX_SIZE` | `5000000` |
| `timeout` | `RABBIT_TIMEOUT` | `30`/`60` (per call) |
| `queues` | `RABBIT_QUEUES` | — (used by `listen`) |
| `exchanges` | `RABBIT_EXCHANGES` | — (used by `listen`) |

`checkRabbitConfig` throws `AppError('MISSING_RABBIT_HOST')` when host is missing.

### `redis`

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

### `events`

Singleton wildcard `EventEmitter2` plus an `attachEvents` helper that wires `events/**/*.js` files at a path.

```ts
import eventEmitter, { attachEvents, eventResult } from '@byelabel/utils/events';

eventEmitter.on('user.created', (payload, cb) => {
  cb(null, { id: payload.id });
});

await attachEvents(__dirname);   // loads ./events/*.js based on EVENTS env
```

### `jobs`

Loads `jobs/**/*.js` and runs each export inside a fresh `vm` context.

```ts
import { runJobs } from '@byelabel/utils/jobs';

await runJobs(__dirname, { db, rabbit });
```

Filter set via `JOBS=*` or `JOBS=foo,bar.run`.

### `output`

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

### `config`

Imported for side effects: loads `.env` from the workspace root, sets `process.env.WORKING_PATH`, `ROOT_PATH`, normalizes `ROUTE_PREFIX`. Imported automatically by other modules — you rarely import it directly.

## Repository

[github.com/morsaken/web-im-helpers](https://github.com/morsaken/web-im-helpers) — see the workspace README for the companion `@byelabel/react` package.

## License

MIT
