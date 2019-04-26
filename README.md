# level-ttl

> Add a `ttl` (time-to-live) option to [`levelup`][levelup] for `put()` and `batch()`.

[![level badge][level-badge]](https://github.com/Level/awesome)
[![npm](https://img.shields.io/npm/v/level-ttl.svg?label=&logo=npm)](https://www.npmjs.com/package/level-ttl)
[![Node version](https://img.shields.io/node/v/level-ttl.svg)](https://www.npmjs.com/package/level-ttl)
[![Travis](https://img.shields.io/travis/Level/level-ttl.svg?logo=travis&label=)](https://travis-ci.org/Level/level-ttl)
[![Coverage Status](https://coveralls.io/repos/github/Level/level-ttl/badge.svg)](https://coveralls.io/github/Level/level-ttl)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![npm](https://img.shields.io/npm/dm/level-ttl.svg?label=dl)](https://www.npmjs.com/package/level-ttl)
[![Backers on Open Collective](https://opencollective.com/level/backers/badge.svg?color=orange)](#backers)
[![Sponsors on Open Collective](https://opencollective.com/level/sponsors/badge.svg?color=orange)](#sponsors)

## Table of Contents

<details><summary>Click to expand</summary>

- [Usage](#usage)
- [Contributing](#contributing)
- [Donate](#donate)
- [License](#license)

</details>

## Usage

Augment `levelup` to handle a new `'ttl'` option on `put()` and `batch()` that specifies the number of milliseconds an entry should remain in the data store. After the TTL, the entry will be automatically cleared for you.

Requires [`levelup`][levelup], [`level`][level] or [`level-hyper`][level-hyper] to be installed separately.

**_Note 1: Version 1.0.0 data stores are not backward compatible with previous versions. If you have unexpired entries in a data store managed by pre-1.0.0, don't expect them to expire if you upgrade to 1.0.0+._** _This is due to a level-sublevel change. It is also recommended that you only use level-sublevel 6.0.0+ with level-ttl._

**_Note 2: `level-ttl` has partial support for `level-spaces`. It should work fine as long as you don't use the `'defaultTTL'` feature, see below. This is being worked on so we can have full support for `level-spaces` as well._**

```js
var levelup  = require('level')
  , ttl      = require('level-ttl')

var db = levelup('/tmp/foo.db')
db = ttl(db)

// --------------------------- put() --------------------------- //
// this entry will only stay in the data store for 1 hour
db.put('foo', 'bar', { ttl: 1000 * 60 * 60 }, function (err) { /* .. */ })

// -------------------------- batch() -------------------------- //
// the two 'put' entries will only stay in the data store for 1 hour
db.batch([
    { type: 'put', key: 'foo', value: 'bar' }
  , { type: 'put', key: 'bam', value: 'boom' }
  , { type: 'del', key: 'w00t' }
], { ttl: 1000 * 60 * 60 }, function (err) { /* .. */ })
```

If you put the same entry twice, you **refresh** the TTL to the _last_ put operation. In this way you can build utilities like [session managers](https://github.com/rvagg/node-level-session/) for your web application where the user's session is refreshed with each visit but expires after a set period of time since their last visit.

Alternatively, for a lower write-footprint you can use the `ttl()` method that is added to your `levelup` instance which can serve to insert or update a ttl for any given key in the database (even if that key doesn't exist but may in the future! Crazy!).

```js
db.put('foo', 'bar', function (err) { /* .. */ })
db.ttl('foo', 1000 * 60 * 60, function (err) { /* .. */ })
```

`level-ttl` uses an internal scan every 10 seconds by default, this limits the available resolution of your TTL values, possibly delaying a delete for up to 10 seconds. The resolution can be tuned by passing the `'checkFrequency'` option to the `ttl()` initialiser.

```js
var db = levelup('/tmp/foo.db')
// scan for deletables every second
db = ttl(db, { checkFrequency: 1000 })

/* .. */
```

Of course, a scan takes some resources, particularly on a data store that makes heavy use of TTLs. If you don't require high accuracy for actual deletions then you can increase the `'checkFrequency'`. Note though that a scan only involves invoking a `levelup` ReadStream that returns _only the entries due to expire_, so it doesn't have to manually check through all entries with a TTL. As usual, it's best to not do too much tuning until you have you have something worth tuning!

### Default TTL

You can set a default ttl value for all your keys by passing the `'defaultTTL'` option to the `ttl()` initialiser. This can be overridden by explicitly setting the ttl value.

In the following examle `'foo'` will expire in 15 minutes while `'beep'` will expire in one minute.

```js
var db = levelup('/tmp/foo.db')
db = ttl(db, { defaultTTL: 15 * 60 * 1000 })
db.put('foo', 'bar', function (err) { /* .. */ })
db.put('beep', 'boop', { ttl: 60 * 1000 }, function (err) { /* .. */ })
```

### `opts.sub`

You can provide a custom storage for the meta data by using the `opts.sub` property. If it's set, that storage will contain all the ttl meta data. A use case for this would be to avoid mixing data and meta data in the same keyspace, since if it's not set, all data will be sharing the same keyspace.

A db for the data and a separate to store the meta data:

```js
var level = require('level')
  , ttl   = require('level-ttl')
  , meta  = level('./meta')
  , db    = ttl(level('./db'), { sub: meta })
  , batch = [
        { type: 'put', key: 'foo', value: 'foovalue' }
      , { type: 'put', key: 'bar', value: 'barvalue' }
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

For more examples on this please check the tests involving `level-sublevel`.

### Shutting down

`level-ttl` uses a timer to regularly check for expiring entries (don't worry, the whole data store isn't scanned, it's very efficient!). The `db.close()` method is automatically wired to stop the timer but there is also a more explicit <b><code>db.stop()</code></b> method that will stop the timer and not pass on to a `close()` underlying `levelup` instance.

## Contributing

[`Level/level-ttl`](https://github.com/Level/level-ttl) is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [Contribution Guide](https://github.com/Level/community/blob/master/CONTRIBUTING.md) for more details.

## Donate

To sustain [`Level`](https://github.com/Level) and its activities, become a backer or sponsor on [Open Collective](https://opencollective.com/level). Your logo or avatar will be displayed on our 28+ [GitHub repositories](https://github.com/Level) and [npm](https://www.npmjs.com/) packages. 💖

### Backers

[![Open Collective backers](https://opencollective.com/level/backers.svg?width=890)](https://opencollective.com/level)

### Sponsors

[![Open Collective sponsors](https://opencollective.com/level/sponsors.svg?width=890)](https://opencollective.com/level)

## License

[MIT](LICENSE.md) © 2013-present Rod Vagg and [Contributors](CONTRIBUTORS.md).

[level-badge]: https://leveljs.org/img/badge.svg

[levelup]: https://github.com/Level/levelup

[level]: https://github.com/Level/level

[level-hyper]: https://github.com/Level/level-hyper
