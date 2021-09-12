# level-ttl

> Add a `ttl` (time-to-live) option to [`levelup`][levelup] for `put()` and `batch()`.

[![level badge][level-badge]](https://github.com/Level/awesome)
[![npm](https://img.shields.io/npm/v/level-ttl.svg)](https://www.npmjs.com/package/level-ttl)
[![Node version](https://img.shields.io/node/v/level-ttl.svg)](https://www.npmjs.com/package/level-ttl)
[![Test](https://img.shields.io/github/workflow/status/Level/level-ttl/Test?label=test)](https://github.com/Level/level-ttl/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/codecov/c/github/Level/level-ttl?label=&logo=codecov&logoColor=fff)](https://codecov.io/gh/Level/level-ttl)
[![Standard](https://img.shields.io/badge/standard-informational?logo=javascript&logoColor=fff)](https://standardjs.com)
[![Common Changelog](https://common-changelog.org/badge.svg)](https://common-changelog.org)
[![Donate](https://img.shields.io/badge/donate-orange?logo=open-collective&logoColor=fff)](https://opencollective.com/level)

## Table of Contents

<details><summary>Click to expand</summary>

- [Usage](#usage)
- [Contributing](#contributing)
- [Donate](#donate)
- [License](#license)

</details>

## Usage

**If you are upgrading:** please see [`UPGRADING.md`](UPGRADING.md).

Augment `levelup` to handle a new `ttl` option on `put()` and `batch()` that specifies the number of milliseconds an entry should remain in the data store. After the TTL, the entry will be automatically cleared for you.

Requires [`levelup`][levelup], [`level`][level] or one of its variants like [`level-rocksdb`][level-rocksdb] to be installed separately.

```js
const level = require('level')
const ttl = require('level-ttl')

const db = ttl(level('./db'))

// This entry will only stay in the store for 1 hour
db.put('foo', 'bar', { ttl: 1000 * 60 * 60 }, (err) => {
  // ..
})

db.batch([
  // Same for these two entries
  { type: 'put', key: 'foo', value: 'bar' },
  { type: 'put', key: 'bam', value: 'boom' },
  { type: 'del', key: 'w00t' }
], { ttl: 1000 * 60 * 5 }, (err) => {})
```

If you put the same entry twice, you **refresh** the TTL to the _last_ put operation. In this way you can build utilities like [session managers](https://github.com/rvagg/node-level-session/) for your web application where the user's session is refreshed with each visit but expires after a set period of time since their last visit.

Alternatively, for a lower write-footprint you can use the `ttl()` method that is added to your `levelup` instance which can serve to insert or update a ttl for any given key in the database - even if that key doesn't exist but may in the future!

```js
db.put('foo', 'bar', (err) => {})
db.ttl('foo', 1000 * 60 * 60, (err) => {})
```

`level-ttl` uses an internal scan every 10 seconds by default, this limits the available resolution of your TTL values, possibly delaying a delete for up to 10 seconds. The resolution can be tuned by passing the `checkFrequency` option to the `ttl()` initialiser.

```js
// Scan every second
const db = ttl(level('./db'), {
  checkFrequency: 1000
})
```

Of course, a scan takes some resources, particularly on a data store that makes heavy use of TTLs. If you don't require high accuracy for actual deletions then you can increase the `checkFrequency`. Note though that a scan only involves invoking a `levelup` ReadStream that returns _only the entries due to expire_, so it doesn't have to manually check through all entries with a TTL. As usual, it's best to not do too much tuning until you have you have something worth tuning!

### Default TTL

You can set a default ttl value for all your keys by passing the `defaultTTL` option to the `ttl()` initialiser. This can be overridden per operation. In the following example A will expire in 15 minutes while B will expire in one minute.

```js
const db = ttl(level('./db'), {
  defaultTTL: 15 * 60 * 1000
})

db.put('A', 'beep', (err) => {})
db.put('B', 'boop', { ttl: 60 * 1000 }, (err) => {})
```

### `opts.sub`

You can provide a custom storage for the meta data by using the `opts.sub` property. If it's set, that storage will contain all the ttl meta data. A use case for this would be to avoid mixing data and meta data in the same keyspace, since if it's not set, all data will be sharing the same keyspace.

A db for the data and a separate to store the meta data:

```js
const level = require('level')
const ttl = require('level-ttl')
const meta = level('./meta')

const db = ttl(level('./db'), { sub: meta })

const batch = [
  { type: 'put', key: 'foo', value: 'foo value' },
  { type: 'put', key: 'bar', value: 'bar value' }
]

db.batch(batch, { ttl: 100 }, function (err) {
  db.createReadStream()
    .on('data', function (data) {
      console.log('data', data)
    })
    .on('end', function () {
      meta.createReadStream()
        .on('data', function (data) {
          console.log('meta', data)
        })
    })
})
```

### Shutting down

`level-ttl` uses a timer to regularly check for expiring entries (don't worry, the whole data store isn't scanned, it's very efficient!). The `db.close()` method is automatically wired to stop the timer but there is also a more explicit `db.stop()` method that will stop the timer and not close the underlying `levelup` instance.

## Contributing

[`Level/level-ttl`](https://github.com/Level/level-ttl) is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [Contribution Guide](https://github.com/Level/community/blob/master/CONTRIBUTING.md) for more details.

## Donate

Support us with a monthly donation on [Open Collective](https://opencollective.com/level) and help us continue our work.

## License

[MIT](LICENSE)

[level-badge]: https://leveljs.org/img/badge.svg

[levelup]: https://github.com/Level/levelup

[level]: https://github.com/Level/level

[level-rocksdb]: https://github.com/Level/level-rocksdb
