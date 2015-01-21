const test       = require('tape')
    , rimraf     = require('rimraf')
    , levelup    = require('level')
    , listStream = require('list-stream')
    , ttl        = require('./')


function fixtape (t) {
  t.like = function (str, reg, msg) {
    t.ok(reg.test(str), msg)
  }
}


function ltest (name, fn, opts) {
  test(name, function (t) {
    var location = '__ttl-' + Math.random()
      , db

    t.__end = t.end
    t.end = function () {
      db.close(function (err) {
        t.notOk(err, 'no error on close()')
        rimraf(location, t.__end.bind(t))
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
  createReadStream(opts)
    .pipe(listStream.obj  (function (err, arr) {
      if (err)
        return t.fail(err)
      callback(null, arr)
    }))
}


function contains (t, arr, key, value) {
  for (var i = 0; i < arr.length; i++) {
    if (typeof key == 'string' && arr[i].key != key)
      continue
    if (typeof value == 'string' && arr[i].value != value)
      continue
    if (key instanceof RegExp && !key.test(arr[i].key))
      continue
    if (value instanceof RegExp && !value.test(arr[i].value))
      continue
    return t.pass('contains {' + (key.source || key) + ', ' + (value.source || value) + '}')
  }
  return t.fail('does not contain {' + (key.source || key) + ', ' + (value.source || value) + '}')
}


// test that the standard API is working as it should
// kind of a lame test but we know they should throw
false && ltest('test single ttl entry', function (db, t) {
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
        contains(t, arr, /\xffttl\xff\d{13}!bar/, 'bar')
        contains(t, arr, '\xffttl\xffbar', /\d{13}/)
        contains(t, arr, 'bar', 'barvalue')
        contains(t, arr, 'foo', 'foovalue')
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
            t.notOk(err, 'no error')
            t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
            contains(t, arr, 'afoo', 'foovalue')
            if (keys >= 1) {
              contains(t, arr, 'bar1', 'barvalue1')
              contains(t, arr, /^\xffttl\xff\d{13}!bar1$/, 'bar1')
              contains(t, arr, '\xffttl\xffbar1', /^\d{13}$/)
            }
            if (keys >= 2) {
              contains(t, arr, 'bar2', 'barvalue2')
              contains(t, arr, /^\xffttl\xff\d{13}!bar2$/, 'bar2')
              contains(t, arr, '\xffttl\xffbar2', /^\d{13}$/)
            }
            if (keys >= 3) {
              contains(t, arr, 'bar3', 'barvalue3')
              contains(t, arr, /^\xffttl\xff\d{13}!bar3$/, 'bar3')
              contains(t, arr, '\xffttl\xffbar3', /^\d{13}$/)
            }
          })
        }, delay)
      }

  db.put('afoo', 'foovalue')
  db.put('bar1', 'barvalue1', { ttl: 180 })
  db.put('bar2', 'barvalue2', { ttl: 120 })
  db.put('bar3', 'barvalue3', { ttl: 60 })

  expect(20, 3)
  expect(140, 2)
  expect(190, 1)
  expect(230, 0)

  setTimeout(t.end.bind(t), 275)
})


ltest('test multiple ttl entries with batch-put', function (db, t, createReadStream) {
  var expect = function (delay, keys) {
        setTimeout(function () {
          db2arr(createReadStream, t, function (err, arr) {
            t.notOk(err, 'no error')
            t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
            contains(t, arr, 'afoo', 'foovalue')
            if (keys >= 1) {
              contains(t, arr, 'bar1', 'barvalue1')
              contains(t, arr, /^\xffttl\xff\d{13}!bar1$/, 'bar1')
              contains(t, arr, '\xffttl\xffbar1', /^\d{13}$/)
            }
            if (keys >= 2) {
              contains(t, arr, 'bar2', 'barvalue2')
              contains(t, arr, /^\xffttl\xff\d{13}!bar2$/, 'bar2')
              contains(t, arr, '\xffttl\xffbar2', /^\d{13}$/)
            }
            if (keys >= 3) {
              contains(t, arr, 'bar3', 'barvalue3')
              contains(t, arr, /^\xffttl\xff\d{13}!bar3$/, 'bar3')
              contains(t, arr, '\xffttl\xffbar3', /^\d{13}$/)
            }
            if (keys >= 3) {
              contains(t, arr, 'bar4', 'barvalue4')
              contains(t, arr, /^\xffttl\xff\d{13}!bar4$/, 'bar4')
              contains(t, arr, '\xffttl\xffbar4', /^\d{13}$/)
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
        db.put('bar', 'barvalue', { ttl: 100 })
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
            contains(t, arr, 'bar', 'barvalue')
            contains(t, arr, 'foo', 'foovalue')
            contains(t, arr, /\xffttl\xff\d{13}!bar/, 'bar')
            contains(t, arr, '\xffttl\xffbar', /\d{13}/)
          })
        }, delay)
      }
    , retest = function (delay) {
        setTimeout(function () {
          var base = putBar()
          verify(base, 50)
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
        db.ttl('bar', 100)
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
            contains(t, arr, 'bar', 'barvalue')
            contains(t, arr, 'foo', 'foovalue')
            contains(t, arr, /\xffttl\xff\d{13}!bar/, 'bar')
            contains(t, arr, '\xffttl\xffbar', /\d{13}/)
          })
        }, delay)
      }
    , retest = function (delay) {
        setTimeout(function () {
          var base = ttlBar()
          verify(base, 50)
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
              contains(t, arr, 'bar', 'barvalue')
              contains(t, arr, 'foo', 'foovalue')
              contains(t, arr, /\xffttl\xff\d{13}!bar/, 'bar')
              contains(t, arr, '\xffttl\xffbar', /\d{13}/)
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
                  { key: 'foo', value: '{"v":"foovalue"}' }
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
              contains(t, arr, 'bar', '{"v":"barvalue"}')
              contains(t, arr, 'foo', '{"v":"foovalue"}')
              contains(t, arr, /\xffttl\xff\d{13}!bar/, 'bar')
              contains(t, arr, '\xffttl\xffbar', /\d{13}/)
            }
          }, { valueEncoding: 'utf8' })
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

test('test stop() method stops interval and doesn\'t hold process up', function (t) {
  t.plan(9)

  var location = '__ttl-' + Math.random()
    , intervals = 0
    , db
    , close

  global._setInterval = global.setInterval
  global.setInterval = function () {
    intervals++
    return global._setInterval.apply(global, arguments)
  }
  global._clearInterval = global.clearInterval
  global.clearInterval = function () {
    intervals--
    return global._clearInterval.apply(global, arguments)
  }

  levelup(location, function (err, _db) {
    t.notOk(err, 'no error on open()')
    close = _db.close.bind(_db) // unmolested close()

    db = ttl(_db, { checkFrequency: 50 })

    t.equals(1, intervals, '1 interval timer')

    db.put( 'foo', 'bar1', { ttl: 10 })
    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.notOk(err, 'no error')
        t.equal('bar1', value)
      })
    }, 10)
    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.ok(err, 'got error')
        t.ok(err.notFound, 'not found error')
        t.notOk(value, 'no value')
      })
    }, 60)
    setTimeout(function () {
      db.stop(function () {
        close(function () {
          global.setInterval = global._setInterval
          t.equals(0, intervals, 'all interval timers cleared')
          rimraf(location, function () {
            t.ok('rimraffed')
          })
        })
      })
    }, 80)
  })
})

test('with default ttl option', function (t) {
  t.plan(6);

  var location = '__ttl-' + Math.random()
    , db

  levelup(location, function (err, _db) {
    t.notOk(err, 'no error on open()')
    close = _db.close.bind(_db) // unmolested close()

    db = ttl(_db, { checkFrequency: 50, defaultTTL: 10 })
    
    db.put( 'foo', 'bar1')
    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.notOk(err, 'no error')
        t.equal('bar1', value)
      })
    }, 10)
    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.ok(err, 'got error')
        t.ok(err.notFound, 'not found error')
        t.notOk(value, 'no value')
      })
    }, 60)
  });
})

test('without options', function (t) {
  var location = '__ttl-' + Math.random()
    , db

  t.__end = t.end
  t.end = function () {
    db.close(function (err) {
      t.notOk(err, 'no error on close()')
      rimraf(location, t.__end.bind(t))
    })
  }

  levelup(location, function (err, _db) {
    t.notOk(err, 'no error on open()')

    var createReadStream = _db.createReadStream.bind(_db)
    try {
      db = ttl(_db)
    } catch(err) {
      t.notOk(err, 'no error on ttl()')
    }
    t.end()
  })
})
