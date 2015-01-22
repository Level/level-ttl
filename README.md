# Level TTL

<img alt="LevelDB Logo" height="100" src="http://leveldb.org/img/logo.svg">

[![NPM](https://nodei.co/npm/level-ttl.png?downloads=true&downloadRank=true)](https://nodei.co/npm/level-ttl/)
[![NPM](https://nodei.co/npm-dl/level-ttl.png?months=6&height=3)](https://nodei.co/npm/level-ttl/)

**Add a `'ttl'` (time-to-live) option to LevelUP for `put()` and `batch()`**

Augment LevelUP to handle a new `'ttl'` option on `put()` and `batch()` that specifies the number of milliseconds an entry should remain in the data store. After the TTL, the entry will be automatically cleared for you.

Requires [LevelUP](https://github.com/rvagg/node-levelup) (or [Level](https://github.com/level/level)) to be installed separately.

***Note: version 1.0.0 data stores are not backward compatible with previous versions. If you have unexpired entries in a data store managed by pre-1.0.0, don't expect them to expire if you upgrade to 1.0.0+.*** *This is due to a level-sublevel change. It is also recommended that you only use level-sublevel 6.0.0+ with level-ttl.*

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

If you put the same entry twice, you **refresh** the TTL to the *last* put operation. In this way you can build utilities like [session managers](https://github.com/rvagg/node-level-session/) for your web application where the user's session is refreshed with each visit but expires after a set period of time since their last visit.

Alternatively, for a lower write-footprint you can use the `ttl()` method that is added to your LevelUP instance which can serve to insert or update a ttl for any given key in the database (even if that key doesn't exist but may in the future! Crazy!).

```js
db.put('foo', 'bar', function (err) { /* .. */ })
db.ttl('foo', 1000 * 60 * 60, function (err) { /* .. */ })
```

**Level TTL** uses an internal scan every 10 seconds by default, this limits the available resolution of your TTL values, possibly delaying a delete for up to 10 seconds. The resolution can be tuned by passing the `'checkFrequency'` option to the `ttl()` initialiser.

```js
var db = level('/tmp/foo.db')
// scan for deletables every second
db = ttl(db, { checkFrequency: 1000 })

/* .. */
```

Of course, a scan takes some resources, particularly on a data store that makes heavy use of TTLs. If you don't require high accuracy for actual deletions then you can increase the `'checkFrequency'`. Note though that a scan only involves invoking a LevelUP ReadStream that returns *only the entries due to expire*, so it doesn't have to manually check through all entries with a TTL. As usual, it's best to not do too much tuning until you have you have something worth tuning!

### Shutting down

**Level TTL** uses a timer to regularly check for expiring entries (don't worry, the whole data store isn't scanned, it's very efficient!). The `db.close()` method is automatically wired to stop the timer but there is also a more explicit <b><code>db.stop()</code></b> method that will stop the timer and not pass on to a `close()` underlying LevelUP instance.

## Contributors

**Level TTL** is powered by the following hackers:

 * [Rod Vagg](https://github.com/rvagg)
 * [Matteo Collina](https://github.com/mcollina)
 * [Josh Duff](https://github.com/TehShrike)

## Licence

Level TTL is Copyright (c) 2013-2015 Rod Vagg [@rvagg](https://twitter.com/rvagg) and licensed under the MIT licence. All rights not explicitly granted in the MIT license are reserved. See the included LICENSE file for more details.
