# Changelog

All notable changes to `@byelabel/react` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

- **utils**: harden crypt token/key generation - createToken: mixed-case alphanumeric pool excluding ambiguous chars (drop 0/1/I, keep L not l, keep o not O), add optional prefix param - createToken/createKey/createRandomHash: validate length, fall back to defaults on invalid input (createKey capped at 21 digits) (43dfaa6)
- **utils**: harden crypt token/key generation - createToken: mixed-case alphanumeric pool excluding ambiguous chars (drop 0/1/I, keep L not l, keep o not O), add optional prefix param - createToken/createKey/createRandomHash: validate length, fall back to defaults on invalid input (createKey capped at 21 digits) (5ac5166)
- **utils**: add streaming reply support to rabbit (f48723f)
- **utils**: add streaming reply support to rabbit Add sendMessageForReplyStream so callers can receive RPC replies as a Node Readable and pipe directly to clients without buffering the full payload in memory. (dbf2e2f)


- loadEnv exported directly (* import removed) fix: undefined variable check added (e2f81bf)


- added attributes (c024b20)
- added (CreatedAt, DeletedAt, Index, UpdatedAt) sequelize-typescript exports (f4b9aef)
- added sequelize-typescript exports (5ef13de)
- publish method changed (c699415)
- fix for searching only given path and subpaths (794847f)
- logging fix (c8627eb)
- info messages change to console.info (fffb205)
- system logging added to db (removed console.log) (e615645)
- date time added to logs on console (f625f0d)
- sequelize-typescript undeleted and update revoked (16ca38c)
- removed unnecessary package (sequelize-typescript) from dependencies (758ae42)
- package updates: amqplib to 2.0.1 version (45bc86d)
- package updates: amqplib to 2.0.1 version (658e94e)
- money.format renamed to money.display (0fd92ea)
- README doc updates (456ea90)
- Signature changes (07b5b78)
- Signature changes (37ee04f)

- useClipboard hook added (a44b1e1)

## [0.0.5] - 2026-05-09

### Other

- github publishing update (ae5bbbd)
- added utils/money module (d99348e)
- fix README: update signature of number.format examples (87c64d3)
- changelog updates: add release labels README.md updates (8956c18)
- added utils/money module (7664f04)

## [0.0.4] - 2026-05-08

### Other

- updated READM file (4020ca8)

## [0.0.3] - 2026-05-08

### Other

- added utils (61fa105)
- environment load fix for frontend added missing unit tests (879f1bd)
- environment load fix for frontend added missing unit tests (74cef63)
- environment load fix for frontend added missing unit tests (2dcaa36)
- null type added (2d71b43)
- configuration check added to database (fe7554c)
- configuration error updates (3581565)
- configuration error updates (ed0899c)
- configuration error updates (7f45ccb)
- configuration error updates (8599f2d)
- configuration checks improved (9e636a4)
- configuration updates (14b4381)
- port fix (2f1c510)
- connection name added (b204df2)
- removed exclusive (a336710)
- Caller side — sendMessageForReply:   - Reply queue is now durable: false, exclusive: true, autoDelete: true, expires: timeoutMs. It dies with the caller's connection (no more orphan amq.gen-* queues if a worker crashes mid-flight) and the    broker enforces a TTL as a backstop. (3d58525)
- keepAlive and keepAliveDelay options added (ee1e6dc)
- improved error handling (df11b69)
- README link fixes (ed937ae)
- README updates (b72902e)
- rabbitmq heartbeat and retry options added fixed for streaming queues (8ab79e2)
- options added (0b2a822)
- signature changed (49d6f88)
- code quality update (eced3db)
- prefix load fix (a0ceff9)
- added log (31cbb17)
- README update (5d6f1d6)
- README update (17d5708)
- environment load update (72f75d6)

## [0.0.2] - 2026-04-26

### Other

- publish update (8eaca9c)
- publish update (ef641e6)
- initial commit (b232157)
