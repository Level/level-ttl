# Level TTL [![Build Status](https://secure.travis-ci.org/rvagg/node-level-ttl.png)](http://travis-ci.org/rvagg/node-level-ttl)

![LevelDB Logo](https://twimg0-a.akamaihd.net/profile_images/3360574989/92fc472928b444980408147e5e5db2fa_bigger.png)

[![NPM](https://nodei.co/npm/level-ttl.png?downloads)](https://nodei.co/npm/level-ttl/)

**Add a `'ttl'` (time-to-live) option to LevelUP for `put()` and `batch()`**

Augment LevelUP to handle a new `'ttl'` option on `put()` and `batch()` that specifies the number of milliseconds an entry should remain in the data store. After the TTL, the entry will be automatically cleared for you.

Requires [LevelUP](https://github.com/rvagg/node-levelup) (or [Level](https://github.com/level/level)) and [sublevel](https://github.com/dominictarr/level-sublevel) to be installed separately.

```js
var levelup  = require('level')
  , ttl      = require('level-ttl')
  , sublevel = require('level-sublevel')

levelup('/tmp/foo.db', function (err, db) {
  db = sublevel(db)
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
})
```

If you put the same entry twice, you **refresh** the TTL to the *last* put operation. In this way you can build utilities like [session managers](https://github.com/rvagg/node-level-session/) for your web application where the user's session is refreshed with each visit but expires after a set period of time since their last visit.

Alternatively, for a lower write-footprint you can use the `ttl()` method that is added to your LevelUP instance which can serve to insert or update a ttl for any given key in the database (even if that key doesn't exist but may in the future! Crazy!).

```js
db.put('foo', 'bar', function (err) { /* .. */ })
db.ttl(1000 * 60 * 60, function (err) { /* .. */ })
```

**Level TTL** uses an internal scan every 10 seconds by default, this limits the available resolution of your TTL values, possibly delaying a delete for up to 10 seconds. The resolution can be tuned by passing the `'checkFrequency'` option to the `ttl()` initialiser.

```js
levelup('/tmp/foo.db', function (err, db) {
  // scan for deletables every second
  db = ttl(db, { checkFrequency: 1000 })

  /* .. */
})
```

Of course, a scan takes some resources, particularly on a data store that makes heavy use of TTLs. If you don't require high accuracy for actual deletions then you can increase the `'checkFrequency'`. Note though that a scan only involves invoking a LevelUP ReadStream that returns *only the entries due to expire*, so it doesn't have to manually check through all entries with a TTL. As usual, it's best to not do too much tuning until you have you have something worth tuning!

## Licence

Level TTL is Copyright (c) 2013 Rod Vagg [@rvagg](https://twitter.com/rvagg) and licensed under the MIT licence. All rights not explicitly granted in the MIT license are reserved. See the included LICENSE file for more details.