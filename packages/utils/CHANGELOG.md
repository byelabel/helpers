# Changelog

All notable changes to `@byelabel/utils` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-08-29

### Features

- **utils**: add `formatAddress` utilities with tests and export module (984277f)

### Refactors

- **db**: extract and reuse `trimSql` utility, add tests (8013ec9)
- **db**: extract and reuse `trimSql` utility, add tests (bda9a08)

### Other

- code quality updates (821bf1c)


- Signature changes (37ee04f)

- money.format renamed to money.display (0fd92ea)
- README doc updates (456ea90)
- Signature changes (07b5b78)

- package updates: amqplib to 2.0.1 version (658e94e)

- package updates: amqplib to 2.0.1 version (45bc86d)

- loadEnv exported directly (* import removed) fix: undefined variable check added (e2f81bf)

- removed unnecessary package (sequelize-typescript) from dependencies (758ae42)

- sequelize-typescript undeleted and update revoked (16ca38c)

- date time added to logs on console (f625f0d)

- system logging added to db (removed console.log) (e615645)

- info messages change to console.info (fffb205)

- logging fix (c8627eb)

- fix for searching only given path and subpaths (794847f)

- **utils**: add streaming reply support to rabbit Add sendMessageForReplyStream so callers can receive RPC replies as a Node Readable and pipe directly to clients without buffering the full payload in memory. (dbf2e2f)

- **utils**: add streaming reply support to rabbit (f48723f)


- publish method changed (c699415)

- added sequelize-typescript exports (5ef13de)

- added (CreatedAt, DeletedAt, Index, UpdatedAt) sequelize-typescript exports (f4b9aef)

- **utils**: harden crypt token/key generation - createToken: mixed-case alphanumeric pool excluding ambiguous chars (drop 0/1/I, keep L not l, keep o not O), add optional prefix param - createToken/createKey/createRandomHash: validate length, fall back to defaults on invalid input (createKey capped at 21 digits) (43dfaa6)
- **utils**: harden crypt token/key generation - createToken: mixed-case alphanumeric pool excluding ambiguous chars (drop 0/1/I, keep L not l, keep o not O), add optional prefix param - createToken/createKey/createRandomHash: validate length, fall back to defaults on invalid input (createKey capped at 21 digits) (5ac5166)

- logging update for redis flush db usage of built in functions (a81a4d2)
- useClipboard hook added (a44b1e1)
- added attributes (c024b20)

- removed dependency "uuid", used native modules (fb2ec59)

- added RABBIT_PREFETCH (default 10), switched consumers to manual ack for real backpressure (4e28f53)

- added toOz/toGr converters, renamed toPounds/toInches to toLb/toIn, fixed isNumeric(NaN) (32f9fd8)

- measurement unit conversions signatures changed (996ea71)

## [1.1.2] - 2026-05-09

### Other

- github publishing update (ae5bbbd)

## [1.1.1] - 2026-05-09

### Other

- added utils/money module (d99348e)
- fix README: update signature of number.format examples (87c64d3)
- changelog updates: add release labels README.md updates (8956c18)

## [1.1.0] - 2026-05-09

### Other

- added utils/money module (7664f04)
- updated READM file (4020ca8)
- added utils (61fa105)

## [1.0.4] - 2026-05-06

### Other

- environment load fix for frontend added missing unit tests (879f1bd)

## [1.0.3] - 2026-05-06

### Other

- environment load fix for frontend added missing unit tests (74cef63)

## [1.0.2] - 2026-05-06

### Other

- environment load fix for frontend added missing unit tests (2dcaa36)

## [1.0.1] - 2026-05-04

### Other

- null type added (2d71b43)

## [1.0.0] - 2026-05-01

### Other

- configuration check added to database (fe7554c)

## [0.2.2] - 2026-05-01

### Other

- configuration error updates (3581565)

## [0.2.1] - 2026-05-01

### Other

- configuration error updates (ed0899c)

## [0.2.0] - 2026-05-01

### Other

- configuration error updates (7f45ccb)
- configuration error updates (8599f2d)

## [0.1.3] - 2026-05-01

### Other

- configuration checks improved (9e636a4)

## [0.1.2] - 2026-05-01

### Other

- configuration updates (14b4381)

## [0.1.1] - 2026-04-30

### Other

- port fix (2f1c510)

## [0.1.0] - 2026-04-30

### Other

- connection name added (b204df2)

## [0.0.15] - 2026-04-29

### Other

- removed exclusive (a336710)

## [0.0.14] - 2026-04-29

### Other

- Caller side — sendMessageForReply:   - Reply queue is now durable: false, exclusive: true, autoDelete: true, expires: timeoutMs. It dies with the caller's connection (no more orphan amq.gen-* queues if a worker crashes mid-flight) and the    broker enforces a TTL as a backstop. (3d58525)

## [0.0.13] - 2026-04-29

### Other

- keepAlive and keepAliveDelay options added (ee1e6dc)

## [0.0.12] - 2026-04-28

### Other

- improved error handling (df11b69)
- README link fixes (ed937ae)

## [0.0.11] - 2026-04-28

### Other

- README updates (b72902e)

## [0.0.10] - 2026-04-28

### Other

- rabbitmq heartbeat and retry options added fixed for streaming queues (8ab79e2)

## [0.0.9] - 2026-04-27

### Other

- options added (0b2a822)

## [0.0.8] - 2026-04-27

### Other

- signature changed (49d6f88)
- code quality update (eced3db)

## [0.0.7] - 2026-04-27

### Other

- prefix load fix (a0ceff9)
- added log (31cbb17)

## [0.0.6] - 2026-04-26

### Other

- README update (5d6f1d6)

## [0.0.5] - 2026-04-26

### Other

- README update (17d5708)

## [0.0.4] - 2026-04-26

### Other

- environment load update (72f75d6)

## [0.0.3] - 2026-04-26

### Other

- publish update (8eaca9c)

## [0.0.2] - 2026-04-26

### Other

- publish update (ef641e6)
- initial commit (b232157)
