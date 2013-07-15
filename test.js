const test     = require('tape')
    , rimraf   = require('rimraf')
    , levelup  = require('level')
    , sublevel = require('level-sublevel')
    , ttl      = require('./')

function fixtape (t) {
  t.like = function (str, reg, msg) {
    t.ok(reg.test(str), msg)
  }
}

function ltest (name, fn, opts) {
  test(name, function (t) {
    var location = '__ttl-' + Math.random()
      , db

    t._end = t.end
    t.end = function () {
      db.close(function (err) {
        t.notOk(err, 'no error on close()')
        rimraf(location, t._end.bind(t))
      })
    }
    fixtape(t)

    levelup(location, opts, function (err, _db) {
      t.notOk(err, 'no error on open()')

      var createReadStream = _db.createReadStream.bind(_db)
      db = ttl(_db, { checkFrequency: 50 })

      fn(db, t, createReadStream)
    })
  })
}

function db2arr (createReadStream, t, callback, opts) {
  var arr = []
  createReadStream(opts)
    .on('data', arr.push.bind(arr))
    .on('error', function (err) {
      t.fail(err)
    })
    .on('close', callback.bind(null, null, arr))
}

/*
function printdb (createReadStream, callback) {
  console.log('================================================')
  createReadStream()
    .on('data', console.log)
    .on('end', function () {
        console.log('================================================')
    })
    .on('close', callback)
}
*/

// test that the standard API is working as it should
// kind of a lame test but we know they should throw
ltest('test single ttl entry', function (db, t) {
  t.throws(db.put.bind(db), { name: 'WriteError', message: 'put() requires key and value arguments' })
  t.throws(db.del.bind(db), { name: 'WriteError', message: 'del() requires a key argument' })
  t.end()
})

ltest('test single ttl entry with put', function (db, t, createReadStream) {
  db.put('foo', 'foovalue', function (err) {
    t.notOk(err, 'no error')
    var base = Date.now() // *should* be able to catch it to the ms
    db.put('bar', 'barvalue', { ttl: 100 }, function (err) {
      t.notOk(err, 'no error')
      db2arr(createReadStream, t, function (err, arr) {
        t.notOk(err, 'no error')
        var ts = base + 100
        // allow 1ms leeway
        if (arr[3] && arr[3].value != String(ts))
          ts++
        t.deepEqual(arr, [
            { key: 'bar', value: 'barvalue' }
          , { key: 'foo', value: 'foovalue' }
          , { key: 'ÿttlÿ' + ts + 'ÿbar', value: 'bar' }
          , { key: 'ÿttlÿbar', value: String(ts) }
        ])
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            t.notOk(err, 'no error')
            t.deepEqual(arr, [
                { key: 'foo', value: 'foovalue' }
            ])

            t.end()
          })
        }, 150)
      })
    })
  })
})

ltest('test multiple ttl entries with put', function (db, t, createReadStream) {
  var expect = function (delay, keys) {
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            var _kl = Math.floor((arr.length - 1) / 3)
            t.notOk(err, 'no error')
            t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
            t.deepEqual(arr[0], { key: 'afoo', value: 'foovalue' })
            if (keys >= 1) {
              t.deepEqual(arr[1], { key: 'bar1', value: 'barvalue1' })
              t.equal(arr[1 + _kl * 2 - 1].value, 'bar1')
              t.like(arr[1 + _kl * 2 - 1].key, /^ÿttlÿ\d{13}ÿbar1$/)
              t.equal(arr[1 + _kl * 2].key, 'ÿttlÿbar1')
              t.like(arr[1 + _kl * 2].value, /^\d{13}$/)
            }
            if (keys >= 2) {
              t.deepEqual(arr[2], { key: 'bar2', value: 'barvalue2' })
              t.equal(arr[1 + _kl * 2 - 2].value, 'bar2')
              t.like(arr[1 + _kl * 2 - 2].key, /^ÿttlÿ\d{13}ÿbar2$/)
              t.equal(arr[1 + _kl * 2 + 1].key, 'ÿttlÿbar2')
              t.like(arr[1 + _kl * 2 + 1].value, /^\d{13}$/)
            }
            if (keys >= 3) {
              t.deepEqual(arr[3], { key: 'bar3', value: 'barvalue3' })
              t.equal(arr[1 + _kl  * 2 - 3].value, 'bar3')
              t.like(arr[1 + _kl * 2 - 3].key, /^ÿttlÿ\d{13}ÿbar3$/)
              t.equal(arr[1 + _kl * 2 + 2].key, 'ÿttlÿbar3')
              t.like(arr[1 + _kl * 2 + 2].value, /^\d{13}$/)
            }
          })
        }, delay)
      }

  db.put('afoo', 'foovalue')
  db.put('bar1', 'barvalue1', { ttl: 180 })
  db.put('bar2', 'barvalue2', { ttl: 120 })
  db.put('bar3', 'barvalue3', { ttl: 60 })

  expect(20, 3)
  expect(110, 2)
  expect(160, 1)
  expect(210, 0)

  setTimeout(t.end.bind(t), 275)
})

ltest('test multiple ttl entries with batch-put', function (db, t, createReadStream) {
  var expect = function (delay, keys) {
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            var _kl = Math.floor((arr.length - 1) / 3)
            t.notOk(err, 'no error')
            t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
            t.deepEqual(arr[0], { key: 'afoo', value: 'foovalue' })
            if (keys >= 1) {
              t.deepEqual(arr[1], { key: 'bar1', value: 'barvalue1' })
              t.equal(arr[1 + _kl * 1].value, 'bar1')
              t.like(arr[1 + _kl * 1].key, /^ÿttlÿ\d{13}ÿbar1$/)
              t.equal(arr[1 + _kl * 2].key, 'ÿttlÿbar1')
              t.like(arr[1 + _kl * 2].value, /^\d{13}$/)
            }
            if (keys >= 2) {
              t.deepEqual(arr[2], { key: 'bar2', value: 'barvalue2' })
              t.equal(arr[1 + _kl * 1 + 1].value, 'bar2')
              t.like(arr[1 + _kl * 1 + 1].key, /^ÿttlÿ\d{13}ÿbar2$/)
              t.equal(arr[1 + _kl * 2 + 1].key, 'ÿttlÿbar2')
              t.like(arr[1 + _kl * 2 + 1].value, /^\d{13}$/)
            }
            if (keys >= 3) {
              t.deepEqual(arr[3], { key: 'bar3', value: 'barvalue3' })
              t.equal(arr[1 + _kl  * 1 + 2].value, 'bar3')
              t.like(arr[1 + _kl * 1 + 2].key, /^ÿttlÿ\d{13}ÿbar3$/)
              t.equal(arr[1 + _kl * 2 + 2].key, 'ÿttlÿbar3')
              t.like(arr[1 + _kl * 2 + 2].value, /^\d{13}$/)
            }
            if (keys >= 4) {
              t.deepEqual(arr[4], { key: 'bar4', value: 'barvalue4' })
              t.equal(arr[1 + _kl  * 1 + 3].value, 'bar4')
              t.like(arr[1 + _kl * 1 + 3].key, /^ÿttlÿ\d{13}ÿbar4$/)
              t.equal(arr[1 + _kl * 2 + 3].key, 'ÿttlÿbar4')
              t.like(arr[1 + _kl * 2 + 3].value, /^\d{13}$/)
            }
          })
        }, delay)
      }

  db.put('afoo', 'foovalue')
  db.batch([
      { type: 'put', key: 'bar1', value: 'barvalue1' }
    , { type: 'put', key: 'bar2', value: 'barvalue2' }
  ], { ttl: 60 })
  db.batch([
      { type: 'put', key: 'bar3', value: 'barvalue3' }
    , { type: 'put', key: 'bar4', value: 'barvalue4' }
  ], { ttl: 120 })

  expect(20, 4)

  setTimeout(t.end.bind(t), 275)
})

ltest('test prolong entry life with additional put', function (db, t, createReadStream) {
  var putBar = function () {
        db.put('bar', 'barvalue', { ttl: 40 })
        return Date.now()
      }
    , verify = function (base, delay) {
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            t.notOk(err, 'no error')
            var ts = base + 37
              , i  = 0
            // allow +/- 3ms leeway, allow for processing speed and Node timer inaccuracy
            for (; i < 6 && arr[3] && arr[3].value; i++) {
              if (arr[3] && arr[3].value == String(ts))
                break
              ts++
            }
            t.deepEqual(arr, [
                { key: 'bar', value: 'barvalue' }
              , { key: 'foo', value: 'foovalue' }
              , { key: 'ÿttlÿ' + ts + 'ÿbar', value: 'bar' }
              , { key: 'ÿttlÿbar', value: String(ts) }
            ])
          })
        }, delay)
      }
    , retest = function (delay) {
        setTimeout(function () {
          var base = putBar()
          verify(base, 10)
        }, delay)
      }
    , i

  db.put('foo', 'foovalue')
  for (i = 0; i < 200; i += 20)
    retest(i)
  setTimeout(t.end.bind(t), 300)
})

ltest('test prolong entry life with ttl(key, ttl)', function (db, t, createReadStream) {
  var ttlBar = function () {
        db.ttl('bar', 40)
        return Date.now()
      }
    , verify = function (base, delay) {
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            t.notOk(err, 'no error')
            var ts = base + 37
              , i  = 0
            // allow +/- 3ms leeway, allow for processing speed and Node timer inaccuracy
            for (; i < 6 && arr[3] && arr[3].value; i++) {
              if (arr[3] && arr[3].value == String(ts))
                break
              ts++
            }
            t.deepEqual(arr, [
                { key: 'bar', value: 'barvalue' }
              , { key: 'foo', value: 'foovalue' }
              , { key: 'ÿttlÿ' + ts + 'ÿbar', value: 'bar' }
              , { key: 'ÿttlÿbar', value: String(ts) }
            ])
          })
        }, delay)
      }
    , retest = function (delay) {
        setTimeout(function () {
          var base = ttlBar()
          verify(base, 10)
        }, delay)
      }
    , i

  db.put('foo', 'foovalue')
  db.put('bar', 'barvalue')
  for (i = 0; i < 200; i += 20)
    retest(i)
  setTimeout(t.end.bind(t), 300)
})

ltest('test del', function (db, t, createReadStream) {
  var verify = function (base, delay) {
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            t.notOk(err, 'no error')
            if (base == -1) {
              // test complete deletion
              t.deepEqual(arr, [
                  { key: 'foo', value: 'foovalue' }
              ])
            } else {
              var ts = base + 197
                , i  = 0
              // allow +/- 3ms leeway, allow for processing speed and Node timer inaccuracy
              for (; i < 6 && arr[3] && arr[3].value; i++) {
                if (arr[3] && arr[3].value == String(ts))
                  break
                ts++
              }
              t.deepEqual(arr, [
                  { key: 'bar', value: 'barvalue' }
                , { key: 'foo', value: 'foovalue' }
                , { key: 'ÿttlÿ' + ts + 'ÿbar', value: 'bar' }
                , { key: 'ÿttlÿbar', value: String(ts) }
              ])
            }
          })
        }, delay)
      }
    , base

  db.put('foo', 'foovalue')
  base = Date.now()
  db.put('bar', 'barvalue', { ttl: 200 })
  verify(base, 20)
  setTimeout(function () {
    db.del('bar')
  }, 50)
  // should not exist at all by 70
  verify(-1, 70)
  setTimeout(t.end.bind(t), 300)
})

ltest('test del with db value encoding', function (db, t, createReadStream) {
  var verify = function (base, delay) {
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            t.notOk(err, 'no error')
            if (base == -1) {
              // test complete deletion
              t.deepEqual(arr, [
                  { key: 'foo', value: "{\"v\":\"foovalue\"}" }
              ])
            } else {
              var ts = base + 197
                , i  = 0
              // allow +/- 10ms leeway, allow for processing speed and Node timer inaccuracy
              for (; i < 10 && arr[3] && arr[3].value; i++) {
                if (arr[3] && arr[3].value == String(ts))
                  break
                ts++
              }
              t.deepEqual(arr, [
                  { key: 'bar', value: "{\"v\":\"barvalue\"}" }
                , { key: 'foo', value: "{\"v\":\"foovalue\"}" }
                , { key: 'ÿttlÿ' + ts + 'ÿbar', value: 'bar' }
                , { key: 'ÿttlÿbar', value: String(ts) }
              ])
            }
          }, { valueEncoding: "utf8" })
        }, delay)
      }
    , base

  db.put( 'foo', { v: 'foovalue' })
  base = Date.now()
  db.put('bar', { v: 'barvalue' }, { ttl: 200 })
  verify(base, 20)
  setTimeout(function () {
    db.del('bar')
  }, 50)
  // should not exist at all by 70
  verify(-1, 70)
  setTimeout(t.end.bind(t), 300)
}, { keyEncoding: 'utf8', valueEncoding: 'json' })
