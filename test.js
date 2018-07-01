const tape = require('tape'),
  ltest = require('ltest')(tape),
  listStream = require('list-stream'),
  ttl = require('./'),
  xtend = require('xtend'),
  sublevel = require('level-sublevel'),
  bwSublevel = require('level-sublevel/bytewise'),
  random = require('slump'),
  bytewise = require('bytewise'),
  bwEncode = bytewise.encode

function test (name, fn, opts) {
  ltest(name, opts, function (t, _db, createReadStream) {
    var db,
      close = _db.close.bind(_db) // unmolested close()

    db = ttl(_db, xtend({ checkFrequency: 50 }, opts))
    fn(t, db, createReadStream, close)
  })
}

function db2arr (createReadStream, t, callback, opts) {
  createReadStream(opts)
    .pipe(listStream.obj(function (err, arr) {
      if (err) return t.fail(err)
      callback(arr)
    }))
}

function bufferEq (a, b) {
  if (a instanceof Buffer && b instanceof Buffer) {
    return a.toString('hex') === b.toString('hex')
  }
}

function isRange (range) {
  return range && (range.gt || range.lt || range.gte || range.lte)
}

function matchRange (range, buffer) {
  var target = buffer.toString('hex'),
    match = true

  if (range.gt) {
    match = match && target > range.gt.toString('hex')
  } else if (range.gte) {
    match = match && target >= range.gte.toString('hex')
  }

  if (range.lt) {
    match = match && target < range.lt.toString('hex')
  } else if (range.lte) {
    match = match && target <= range.lte.toString('hex')
  }

  return match
}

function bwRange (prefix, resolution) {
  const now = Date.now(),
    min = new Date(resolution ? now - resolution : 0),
    max = new Date(resolution ? now + resolution : 9999999999999)
  return {
    gte: bwEncode(prefix ? prefix.concat(min) : min),
    lte: bwEncode(prefix ? prefix.concat(max) : max)
  }
}

function formatRecord (key, value) {
  if (isRange(key)) {
    key.source = '[object KeyRange]'
  }
  if (isRange(value)) {
    value.source = '[object ValueRange]'
  }
  return '{' + (key.source || key) + ', ' + (value.source || value) + '}'
}

function contains (t, arr, key, value) {
  for (var i = 0; i < arr.length; i++) {
    if (typeof key === 'string' && arr[i].key != key) continue
    if (typeof value === 'string' && arr[i].value != value) continue
    if (key instanceof RegExp && !key.test(arr[i].key)) continue
    if (value instanceof RegExp && !value.test(arr[i].value)) continue
    if (key instanceof Buffer && !bufferEq(key, arr[i].key)) continue
    if (value instanceof Buffer && !bufferEq(value, arr[i].value)) continue
    if (isRange(key) && !matchRange(key, arr[i].key)) continue
    if (isRange(value) && !matchRange(value, arr[i].value)) continue
    return t.pass('contains ' + formatRecord(key, value))
  }
  return t.fail('does not contain ' + formatRecord(key, value))
}

function randomPutBatch (length) {
  var batch = [],
    randomize = function () {
      return random.string({ enc: 'base58', length: 10 })
    }
  for (var i = 0; i < length; ++i) {
    batch.push({ type: 'put', key: randomize(), value: randomize() })
  }
  return batch
}

function verifyIn (delay, createReadStream, t, cb, opts) {
  setTimeout(function () {
    db2arr(createReadStream, t, cb, opts)
  }, delay)
}

test('single ttl entry', function (t, db) {
  t.throws(db.put.bind(db), { name: 'WriteError', message: 'put() requires key and value arguments' })
  t.throws(db.del.bind(db), { name: 'WriteError', message: 'del() requires a key argument' })
  t.end()
})

test('single ttl entry with put', function (t, db, createReadStream) {
  db.put('foo', 'foovalue', function (err) {
    t.notOk(err, 'no error')
    db.put('bar', 'barvalue', { ttl: 100 }, function (err) {
      t.notOk(err, 'no error')
      db2arr(createReadStream, t, function (arr) {
        contains(t, arr, /!ttl!x!\d{13}!bar/, 'bar')
        contains(t, arr, '!ttl!bar', /\d{13}/)
        contains(t, arr, 'bar', 'barvalue')
        contains(t, arr, 'foo', 'foovalue')
        verifyIn(150, createReadStream, t, function (arr) {
          t.deepEqual(arr, [
            { key: 'foo', value: 'foovalue' }
          ])
          t.end()
        })
      })
    })
  })
})

test('single ttl entry with put (custom ttlEncoding)', function (t, db, createReadStream) {
  db.put('foo', 'foovalue', function (err) {
    t.notOk(err, 'no error')
    db.put('bar', 'barvalue', { ttl: 100 }, function (err) {
      t.notOk(err, 'no error')
      db2arr(createReadStream, t, function (arr) {
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar'))
        contains(t, arr, bwEncode([ 'ttl', 'bar' ]), bwRange())
        contains(t, arr, Buffer.from('bar'), Buffer.from('barvalue'))
        contains(t, arr, Buffer.from('foo'), Buffer.from('foovalue'))

        verifyIn(150, createReadStream, t, function (arr) {
          t.deepEqual(arr, [
            { key: 'foo', value: 'foovalue' }
          ])
          t.end()
        })
      }, { keyEncoding: 'binary', valueEncoding: 'binary' })
    })
  })
}, { ttlEncoding: bytewise })

test('multiple ttl entries with put', function (t, db, createReadStream) {
  var expect = function (delay, keys, cb) {
    verifyIn(delay, createReadStream, t, function (arr) {
      t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
      contains(t, arr, 'afoo', 'foovalue')
      if (keys >= 1) {
        contains(t, arr, 'bar1', 'barvalue1')
        contains(t, arr, /^!ttl!x!\d{13}!bar1$/, 'bar1')
        contains(t, arr, '!ttl!bar1', /^\d{13}$/)
      }
      if (keys >= 2) {
        contains(t, arr, 'bar2', 'barvalue2')
        contains(t, arr, /^!ttl!x!\d{13}!bar2$/, 'bar2')
        contains(t, arr, '!ttl!bar2', /^\d{13}$/)
      }
      if (keys >= 3) {
        contains(t, arr, 'bar3', 'barvalue3')
        contains(t, arr, /^!ttl!x!\d{13}!bar3$/, 'bar3')
        contains(t, arr, '!ttl!bar3', /^\d{13}$/)
      }
      cb && cb()
    })
  }

  db.put('afoo', 'foovalue')
  db.put('bar1', 'barvalue1', { ttl: 400 })
  db.put('bar2', 'barvalue2', { ttl: 250 })
  db.put('bar3', 'barvalue3', { ttl: 100 })

  expect(25, 3)
  expect(200, 2)
  expect(350, 1)
  expect(500, 0, t.end.bind(t))
})

test('multiple ttl entries with put (custom ttlEncoding)', function (t, db, createReadStream) {
  var expect = function (delay, keys, cb) {
    verifyIn(delay, createReadStream, t, function (arr) {
      t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
      contains(t, arr, Buffer.from('afoo'), Buffer.from('foovalue'))
      if (keys >= 1) {
        contains(t, arr, Buffer.from('bar1'), Buffer.from('barvalue1'))
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar1'))
        contains(t, arr, bwEncode([ 'ttl', 'bar1' ]), bwRange())
      }
      if (keys >= 2) {
        contains(t, arr, Buffer.from('bar2'), Buffer.from('barvalue2'))
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar2'))
        contains(t, arr, bwEncode([ 'ttl', 'bar2' ]), bwRange())
      }
      if (keys >= 3) {
        contains(t, arr, Buffer.from('bar3'), Buffer.from('barvalue3'))
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar3'))
        contains(t, arr, bwEncode([ 'ttl', 'bar3' ]), bwRange())
      }
      cb && cb()
    }, { keyEncoding: 'binary', valueEncoding: 'binary' })
  }

  db.put('afoo', 'foovalue')
  db.put('bar1', 'barvalue1', { ttl: 400 })
  db.put('bar2', 'barvalue2', { ttl: 250 })
  db.put('bar3', 'barvalue3', { ttl: 100 })

  expect(25, 3)
  expect(200, 2)
  expect(350, 1)
  expect(500, 0, t.end.bind(t))
}, { ttlEncoding: bytewise })

test('multiple ttl entries with batch-put', function (t, db, createReadStream) {
  var expect = function (delay, keys, cb) {
    verifyIn(delay, createReadStream, t, function (arr) {
      t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
      contains(t, arr, 'afoo', 'foovalue')
      if (keys >= 1) {
        contains(t, arr, 'bar1', 'barvalue1')
        contains(t, arr, /^!ttl!x!\d{13}!bar1$/, 'bar1')
        contains(t, arr, '!ttl!bar1', /^\d{13}$/)
      }
      if (keys >= 2) {
        contains(t, arr, 'bar2', 'barvalue2')
        contains(t, arr, /^!ttl!x!\d{13}!bar2$/, 'bar2')
        contains(t, arr, '!ttl!bar2', /^\d{13}$/)
      }
      if (keys >= 3) {
        contains(t, arr, 'bar3', 'barvalue3')
        contains(t, arr, /^!ttl!x!\d{13}!bar3$/, 'bar3')
        contains(t, arr, '!ttl!bar3', /^\d{13}$/)
      }
      if (keys >= 3) {
        contains(t, arr, 'bar4', 'barvalue4')
        contains(t, arr, /^!ttl!x!\d{13}!bar4$/, 'bar4')
        contains(t, arr, '!ttl!bar4', /^\d{13}$/)
      }
      cb && cb()
    })
  }

  db.put('afoo', 'foovalue')
  db.batch([
    { type: 'put', key: 'bar1', value: 'barvalue1' },
    { type: 'put', key: 'bar2', value: 'barvalue2' }
  ], { ttl: 60 })
  db.batch([
    { type: 'put', key: 'bar3', value: 'barvalue3' },
    { type: 'put', key: 'bar4', value: 'barvalue4' }
  ], { ttl: 120 })

  expect(20, 4, t.end.bind(t))
})

test('multiple ttl entries with batch-put (custom ttlEncoding)', function (t, db, createReadStream) {
  var expect = function (delay, keys, cb) {
    verifyIn(delay, createReadStream, t, function (arr) {
      t.equal(arr.length, 1 + keys * 3, 'correct number of entries in db')
      contains(t, arr, Buffer.from('afoo'), Buffer.from('foovalue'))
      if (keys >= 1) {
        contains(t, arr, Buffer.from('bar1'), Buffer.from('barvalue1'))
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar1'))
        contains(t, arr, bwEncode([ 'ttl', 'bar1' ]), bwRange())
      }
      if (keys >= 2) {
        contains(t, arr, Buffer.from('bar2'), Buffer.from('barvalue2'))
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar2'))
        contains(t, arr, bwEncode([ 'ttl', 'bar2' ]), bwRange())
      }
      if (keys >= 3) {
        contains(t, arr, Buffer.from('bar3'), Buffer.from('barvalue3'))
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar3'))
        contains(t, arr, bwEncode([ 'ttl', 'bar3' ]), bwRange())
      }
      if (keys >= 3) {
        contains(t, arr, Buffer.from('bar4'), Buffer.from('barvalue4'))
        contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar4'))
        contains(t, arr, bwEncode([ 'ttl', 'bar4' ]), bwRange())
      }
      cb && cb()
    }, { keyEncoding: 'binary', valueEncoding: 'binary' })
  }

  db.put('afoo', 'foovalue')
  db.batch([
    { type: 'put', key: 'bar1', value: 'barvalue1' },
    { type: 'put', key: 'bar2', value: 'barvalue2' }
  ], { ttl: 60 })
  db.batch([
    { type: 'put', key: 'bar3', value: 'barvalue3' },
    { type: 'put', key: 'bar4', value: 'barvalue4' }
  ], { ttl: 120 })

  expect(20, 4, t.end.bind(t))
}, { ttlEncoding: bytewise })

test('prolong entry life with additional put', function (t, db, createReadStream) {
  var retest = function (delay, cb) {
      setTimeout(function () {
        db.put('bar', 'barvalue', { ttl: 250 })
        verifyIn(50, createReadStream, t, function (arr) {
          contains(t, arr, 'foo', 'foovalue')
          contains(t, arr, 'bar', 'barvalue')
          contains(t, arr, /!ttl!x!\d{13}!bar/, 'bar')
          contains(t, arr, '!ttl!bar', /\d{13}/)
          cb && cb()
        })
      }, delay)
    },
    i

  db.put('foo', 'foovalue')
  for (i = 0; i < 180; i += 20) retest(i)
  retest(180, t.end.bind(t))
})

test('prolong entry life with additional put (custom ttlEncoding)', function (t, db, createReadStream) {
  var retest = function (delay, cb) {
      setTimeout(function () {
        db.put('bar', 'barvalue', { ttl: 250 })
        verifyIn(50, createReadStream, t, function (arr) {
          contains(t, arr, Buffer.from('foo'), Buffer.from('foovalue'))
          contains(t, arr, Buffer.from('bar'), Buffer.from('barvalue'))
          contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar'))
          contains(t, arr, bwEncode([ 'ttl', 'bar' ]), bwRange())
          cb && cb()
        }, { keyEncoding: 'binary', valueEncoding: 'binary' })
      }, delay)
    },
    i

  db.put('foo', 'foovalue')
  for (i = 0; i < 180; i += 20) retest(i)
  retest(180, t.end.bind(t))
}, { ttlEncoding: bytewise })

test('prolong entry life with ttl(key, ttl)', function (t, db, createReadStream) {
  var retest = function (delay, cb) {
      setTimeout(function () {
        db.ttl('bar', 250)
        verifyIn(25, createReadStream, t, function (arr) {
          contains(t, arr, 'bar', 'barvalue')
          contains(t, arr, 'foo', 'foovalue')
          contains(t, arr, /!ttl!x!\d{13}!bar/, 'bar')
          contains(t, arr, '!ttl!bar', /\d{13}/)
          cb && cb()
        })
      }, delay)
    },
    i

  db.put('foo', 'foovalue')
  db.put('bar', 'barvalue')
  for (i = 0; i < 180; i += 20) retest(i)
  retest(180, t.end.bind(t))
})

test('prolong entry life with ttl(key, ttl) (custom ttlEncoding)', function (t, db, createReadStream) {
  var retest = function (delay, cb) {
      setTimeout(function () {
        db.ttl('bar', 250)
        verifyIn(25, createReadStream, t, function (arr) {
          contains(t, arr, Buffer.from('bar'), Buffer.from('barvalue'))
          contains(t, arr, Buffer.from('foo'), Buffer.from('foovalue'))
          contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar'))
          contains(t, arr, bwEncode([ 'ttl', 'bar' ]), bwRange())
          cb && cb()
        }, { keyEncoding: 'binary', valueEncoding: 'binary' })
      }, delay)
    },
    i

  db.put('foo', 'foovalue')
  db.put('bar', 'barvalue')
  for (i = 0; i < 180; i += 20) retest(i)
  retest(180, t.end.bind(t))
}, { ttlEncoding: bytewise })

test('del removes both key and its ttl meta data', function (t, db, createReadStream) {
  db.put('foo', 'foovalue')
  db.put('bar', 'barvalue', { ttl: 250 })

  verifyIn(150, createReadStream, t, function (arr) {
    contains(t, arr, 'foo', 'foovalue')
    contains(t, arr, 'bar', 'barvalue')
    contains(t, arr, /!ttl!x!\d{13}!bar/, 'bar')
    contains(t, arr, '!ttl!bar', /\d{13}/)
  })

  setTimeout(function () {
    db.del('bar')
  }, 250)

  verifyIn(350, createReadStream, t, function (arr) {
    t.deepEqual(arr, [
      { key: 'foo', value: 'foovalue' }
    ])
    t.end()
  })
})

test('del removes both key and its ttl meta data (value encoding)', function (t, db, createReadStream) {
  db.put('foo', { v: 'foovalue' })
  db.put('bar', { v: 'barvalue' }, { ttl: 250 })

  verifyIn(50, createReadStream, t, function (arr) {
    contains(t, arr, 'foo', '{"v":"foovalue"}')
    contains(t, arr, 'bar', '{"v":"barvalue"}')
    contains(t, arr, /!ttl!x!\d{13}!bar/, 'bar')
    contains(t, arr, '!ttl!bar', /\d{13}/)
  }, { valueEncoding: 'utf8' })

  setTimeout(function () {
    db.del('bar')
  }, 175)

  verifyIn(350, createReadStream, t, function (arr) {
    t.deepEqual(arr, [
      { key: 'foo', value: '{"v":"foovalue"}' }
    ])
    t.end()
  }, { valueEncoding: 'utf8' })
}, { keyEncoding: 'utf8', valueEncoding: 'json' })

test('del removes both key and its ttl meta data (custom ttlEncoding)', function (t, db, createReadStream) {
  db.put('foo', { v: 'foovalue' })
  db.put('bar', { v: 'barvalue' }, { ttl: 250 })

  verifyIn(50, createReadStream, t, function (arr) {
    contains(t, arr, Buffer.from('foo'), Buffer.from('{"v":"foovalue"}'))
    contains(t, arr, Buffer.from('bar'), Buffer.from('{"v":"barvalue"}'))
    contains(t, arr, bwRange([ 'ttl', 'x' ]), bwEncode('bar'))
    contains(t, arr, bwEncode([ 'ttl', 'bar' ]), bwRange())
  }, { keyEncoding: 'binary', valueEncoding: 'binary' })

  setTimeout(function () {
    db.del('bar')
  }, 175)

  verifyIn(350, createReadStream, t, function (arr) {
    t.deepEqual(arr, [
      { key: 'foo', value: '{"v":"foovalue"}' }
    ])
    t.end()
  }, { valueEncoding: 'utf8' })
}, { keyEncoding: 'utf8', valueEncoding: 'json', ttlEncoding: bytewise })

function wrappedTest () {
  var intervals = 0,
    _setInterval = global.setInterval,
    _clearInterval = global.clearInterval

  global.setInterval = function () {
    intervals++
    return _setInterval.apply(global, arguments)
  }

  global.clearInterval = function () {
    intervals--
    return _clearInterval.apply(global, arguments)
  }

  test('test stop() method stops interval and doesn\'t hold process up', function (t, db, createReadStream, close) {
    t.equals(intervals, 1, '1 interval timer')
    db.put('foo', 'bar1', { ttl: 25 })

    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.notOk(err, 'no error')
        t.equal('bar1', value)
      })
    }, 40)

    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.ok(err && err.notFound, 'not found error')
        t.notOk(value, 'no value')
      })
    }, 80)

    setTimeout(function () {
      db.stop(function () {
        close(function () {
          global.setInterval = _setInterval
          global.clearInterval = _clearInterval
          t.equals(0, intervals, 'all interval timers cleared')
          t.end()
        })
      })
    }, 120)
  })
}

wrappedTest()

function testSinglePutWithDefaultTtl (t, db, createReadStream) {
  db.put('foo', 'foovalue', function (err) {
    t.ok(!err, 'no error')

    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.notOk(err, 'no error')
        t.equal('foovalue', value)
      })
    }, 50)

    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.ok(err && err.notFound, 'not found error')
        t.notOk(value, 'no value')
        t.end()
      })
    }, 175)
  })
}

test('single put with default ttl set', testSinglePutWithDefaultTtl, { defaultTTL: 75 })

test('single put with default ttl set (custom ttlEncoding)',testSinglePutWithDefaultTtl, {
  defaultTTL: 75,
  ttlEncoding: bytewise
})

function testSinglePutWithTtlOverride (t, db, createReadStream) {
  db.put('foo', 'foovalue', { ttl: 99 }, function (err) {
    t.ok(!err, 'no error')
    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.notOk(err, 'no error')
        t.equal('foovalue', value)
      })
    }, 50)

    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.ok(err && err.notFound, 'not found error')
        t.notOk(value, 'no value')
        t.end()
      })
    }, 200)
  })
}

test('single put with overridden ttl set', testSinglePutWithTtlOverride, { defaultTTL: 75 })

test('single put with overridden ttl set (custom ttlEncoding)', testSinglePutWithTtlOverride, {
  defaultTTL: 75,
  ttlEncoding: bytewise
})

function testBatchPutWithDefaultTtl (t, db, createReadStream) {
  db.batch([
    { type: 'put', key: 'foo', value: 'foovalue' },
    { type: 'put', key: 'bar', value: 'barvalue' }
  ], function (err) {
    t.ok(!err, 'no error')
    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.notOk(err, 'no error')
        t.equal('foovalue', value)
        db.get('bar', function (err, value) {
          t.notOk(err, 'no error')
          t.equal('barvalue', value)
        })
      })
    }, 50)

    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.ok(err && err.notFound, 'not found error')
        t.notOk(value, 'no value')
        db.get('bar', function (err, value) {
          t.ok(err && err.notFound, 'not found error')
          t.notOk(value, 'no value')
          t.end()
        })
      })
    }, 175)
  })
}

test('batch put with default ttl set', testBatchPutWithDefaultTtl, { defaultTTL: 75 })

test('batch put with default ttl set (custom ttlEncoding)', testBatchPutWithDefaultTtl, {
  defaultTTL: 75,
  ttlEncoding: bytewise
})

function testBatchPutWithTtlOverride (t, db, createReadStream) {
  db.batch([
    { type: 'put', key: 'foo', value: 'foovalue' },
    { type: 'put', key: 'bar', value: 'barvalue' }
  ], { ttl: 99 }, function (err) {
    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.notOk(err, 'no error')
        t.equal('foovalue', value)
        db.get('bar', function (err, value) {
          t.notOk(err, 'no error')
          t.equal('barvalue', value)
        })
      })
    }, 50)

    setTimeout(function () {
      db.get('foo', function (err, value) {
        t.ok(err && err.notFound, 'not found error')
        t.notOk(value, 'no value')
        db.get('bar', function (err, value) {
          t.ok(err && err.notFound, 'not found error')
          t.notOk(value, 'no value')
          t.end()
        })
      })
    }, 200)
  })
}

test('batch put with overriden ttl set', testBatchPutWithTtlOverride, { defaultTTL: 75 })

test('batch put with overriden ttl set (custom ttlEncoding)', testBatchPutWithTtlOverride, {
  defaultTTL: 75,
  ttlEncoding: bytewise
})

ltest('without options', function (t, db, createReadStream) {
  try {
    ttl(db)
  } catch (err) {
    t.notOk(err, 'no error on ttl()')
  }
  t.end()
})

ltest('data and level-sublevel ttl meta data separation', function (t, db, createReadStream) {
  var subDb = sublevel(db),
    meta = subDb.sublevel('meta'),
    ttldb = ttl(db, { sub: meta }),
    batch = randomPutBatch(5)

  ttldb.batch(batch, { ttl: 10000 }, function (err) {
    t.ok(!err, 'no error')
    db2arr(createReadStream, t, function (arr) {
      batch.forEach(function (item) {
        contains(t, arr, '!meta!' + item.key, /\d{13}/)
        contains(t, arr, new RegExp('!meta!x!\\d{13}!' + item.key), item.key)
      })
      t.end()
    })
  })
})

ltest('data and level-sublevel ttl meta data separation (custom ttlEncoding)', function (t, db, createReadStream) {
  var subDb = sublevel(db),
    meta = subDb.sublevel('meta'),
    ttldb = ttl(db, { sub: meta, ttlEncoding: bytewise }),
    batch = randomPutBatch(5)

  ttldb.batch(batch, { ttl: 10000 }, function (err) {
    t.ok(!err, 'no error')
    db2arr(createReadStream, t, function (arr) {
      batch.forEach(function (item) {
        contains(t, arr, '!meta!' + bwEncode([ item.key ]), bwRange())
        contains(t, arr, {
          gt: '!meta!' + bwEncode([ 'x', new Date(0), item.key ]),
          lt: '!meta!' + bwEncode([ 'x', new Date(9999999999999), item.key ])
        }, bwEncode(item.key))
      })
      t.end()
    }, { valueEncoding: 'binary' })
  })
})

ltest('data and level-sublevel ttl meta data separation (custom sublevel encoding)', function (t, db, createReadStream) {
  var subDb = bwSublevel(db),
    meta = subDb.sublevel('meta'),
    ttldb = ttl(db, { sub: meta, ttlEncoding: bytewise }),
    batch = randomPutBatch(5)

  ttldb.batch(batch, { ttl: 10000 }, function (err) {
    t.ok(!err, 'no error')
    db2arr(createReadStream, t, function (arr) {
      batch.forEach(function (item) {
        // bytewise keys in bytewise sublevels are double-encoded for now
        contains(t, arr, bwEncode([ [ 'meta' ], bwEncode([ item.key ]) ]), bwRange())
        contains(t, arr, {
          gt: bwEncode([ [ 'meta' ], bwEncode([ 'x', new Date(0), item.key ]) ]),
          lt: bwEncode([ [ 'meta' ], bwEncode([ 'x', new Date(9999999999999), item.key ]) ])
        }, bwEncode(item.key))
      })
      t.end()
    }, { keyEncoding: 'binary', valueEncoding: 'binary' })
  })
})

ltest('that level-sublevel data expires properly', function (t, db, createReadStream) {
  var subDb = sublevel(db),
    meta = subDb.sublevel('meta'),
    ttldb = ttl(db, { checkFrequency: 25, sub: meta })

  ttldb.batch(randomPutBatch(50), { ttl: 100 }, function (err) {
    t.ok(!err, 'no error')
    verifyIn(200, createReadStream, t, function (arr) {
      t.equal(arr.length, 0, 'should be empty array')
      t.end()
    })
  })
})

ltest('that level-sublevel data expires properly (custom ttlEncoding)', function (t, db, createReadStream) {
  var subDb = sublevel(db),
    meta = subDb.sublevel('meta'),
    ttldb = ttl(db, { checkFrequency: 25, sub: meta, ttlEncoding: bytewise })

  ttldb.batch(randomPutBatch(50), { ttl: 100 }, function (err) {
    t.ok(!err, 'no error')
    verifyIn(200, createReadStream, t, function (arr) {
      t.equal(arr.length, 0, 'should be empty array')
      t.end()
    })
  })
})

test('prolong entry with PUT should not duplicate the TTL key', function (t, db, createReadStream) {
  var retest = function (delay, cb) {
      setTimeout(function () {
        db.put('bar', 'barvalue', { ttl: 20 })
        verifyIn(50, createReadStream, t, function (arr) {
          var count = arr.filter(function (kv) {
            return /!ttl!x!\d{13}!bar/.exec(kv.key)
          }).length

          t.ok(count <= 1, 'contains one or zero TTL entry')
          cb && cb()
        })
      }, delay)
    },
    i

  db.put('foo', 'foovalue')
  for (i = 0; i < 50; i++) retest(i)
  retest(50, t.end.bind(t))
}, { checkFrequency: 5 })
