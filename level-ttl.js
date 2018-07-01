const after = require('after')
const xtend = require('xtend')
const encoding = require('./encoding')
const Lock = require('lock')

function prefixKey (db, key) {
  return db._ttl.encoding.encode(db._ttl._prefixNs.concat(key))
}

function expiryKey (db, exp, key) {
  return db._ttl.encoding.encode(db._ttl._expiryNs.concat(exp, key))
}

function buildQuery (db) {
  const encode = db._ttl.encoding.encode
  const expiryNs = db._ttl._expiryNs
  return {
    keyEncoding: 'binary',
    valueEncoding: 'binary',
    gte: encode(expiryNs),
    lte: encode(expiryNs.concat(new Date()))
  }
}

function startTtl (db, checkFrequency) {
  db._ttl.intervalId = setInterval(function () {
    const batch = []
    const subBatch = []
    const sub = db._ttl.sub
    const query = buildQuery(db)
    const decode = db._ttl.encoding.decode
    var createReadStream

    db._ttl._checkInProgress = true

    if (sub) {
      createReadStream = sub.createReadStream.bind(sub)
    } else {
      createReadStream = db.createReadStream.bind(db)
    }

    createReadStream(query)
      .on('data', function (data) {
        // the value is the key!
        const key = decode(data.value)
        // expiryKey that matches this query
        subBatch.push({ type: 'del', key: data.key })
        subBatch.push({ type: 'del', key: prefixKey(db, key) })
        // the actual data that should expire now!
        batch.push({ type: 'del', key: key })
      })
      .on('error', db.emit.bind(db, 'error'))
      .on('end', function () {
        if (!batch.length) return

        if (sub) {
          sub.batch(subBatch, { keyEncoding: 'binary' }, function (err) {
            if (err) db.emit('error', err)
          })

          db._ttl.batch(batch, { keyEncoding: 'binary' }, function (err) {
            if (err) db.emit('error', err)
          })
        } else {
          db._ttl.batch(subBatch.concat(batch), { keyEncoding: 'binary' }, function (err) {
            if (err) db.emit('error', err)
          })
        }
      })
      .on('close', function () {
        db._ttl._checkInProgress = false
        if (db._ttl._stopAfterCheck) {
          stopTtl(db, db._ttl._stopAfterCheck)
          db._ttl._stopAfterCheck = null
        }
      })
  }, checkFrequency)

  if (db._ttl.intervalId.unref) {
    db._ttl.intervalId.unref()
  }
}

function stopTtl (db, callback) {
  // can't close a db while an interator is in progress
  // so if one is, defer
  if (db._ttl._checkInProgress) {
    db._ttl._stopAfterCheck = callback
    return db._ttl._stopAfterCheck
  }
  clearInterval(db._ttl.intervalId)
  callback && callback()
}

function ttlon (db, keys, ttl, callback) {
  const exp = new Date(Date.now() + ttl)
  const batch = []
  const sub = db._ttl.sub
  const batchFn = (sub ? sub.batch.bind(sub) : db._ttl.batch)
  const encode = db._ttl.encoding.encode

  db._ttl._lock(keys, function (release) {
    callback = release(callback || function () {})
    ttloff(db, keys, function () {
      keys.forEach(function (key) {
        batch.push({ type: 'put', key: expiryKey(db, exp, key), value: encode(key) })
        batch.push({ type: 'put', key: prefixKey(db, key), value: encode(exp) })
      })

      if (!batch.length) return callback()

      batchFn(batch, { keyEncoding: 'binary', valueEncoding: 'binary' }, function (err) {
        if (err) { db.emit('error', err) }
        callback()
      })
    })
  })
}

function ttloff (db, keys, callback) {
  const batch = []
  const sub = db._ttl.sub
  const getFn = (sub ? sub.get.bind(sub) : db.get.bind(db))
  const batchFn = (sub ? sub.batch.bind(sub) : db._ttl.batch)
  const decode = db._ttl.encoding.decode
  const done = after(keys.length, function (err) {
    if (err) db.emit('error', err)

    if (!batch.length) return callback && callback()

    batchFn(batch, { keyEncoding: 'binary', valueEncoding: 'binary' }, function (err) {
      if (err) { db.emit('error', err) }
      callback && callback()
    })
  })

  keys.forEach(function (key) {
    const prefixedKey = prefixKey(db, key)
    getFn(prefixedKey, { keyEncoding: 'binary', valueEncoding: 'binary' }, function (err, exp) {
      if (!err && exp) {
        batch.push({ type: 'del', key: expiryKey(db, decode(exp), key) })
        batch.push({ type: 'del', key: prefixedKey })
      }
      done(err && err.name !== 'NotFoundError' && err)
    })
  })
}

function put (db, key, value, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  options || (options = {})

  if (db._ttl.options.defaultTTL > 0 && !options.ttl && options.ttl !== 0) {
    options.ttl = db._ttl.options.defaultTTL
  }

  var done
  var _callback = callback

  if (options.ttl > 0 && key != null && value != null) {
    done = after(2, _callback || function () {})
    callback = done
    ttlon(db, [ key ], options.ttl, done)
  }

  db._ttl.put.call(db, key, value, options, callback)
}

function setTtl (db, key, ttl, callback) {
  if (ttl > 0 && key != null) {
    ttlon(db, [ key ], ttl, callback)
  }
}

function del (db, key, options, callback) {
  var done
  var _callback = callback

  if (key != null) {
    done = after(2, _callback || function () {})
    callback = done
    ttloff(db, [ key ], done)
  }

  db._ttl.del.call(db, key, options, callback)
}

function batch (db, arr, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  options || (options = {})

  if (db._ttl.options.defaultTTL > 0 && !options.ttl && options.ttl !== 0) {
    options.ttl = db._ttl.options.defaultTTL
  }

  var done
  var on
  var off
  var _callback = callback

  if (options.ttl > 0 && Array.isArray(arr)) {
    done = after(3, _callback || function () {})
    callback = done

    on = []
    off = []
    arr.forEach(function (entry) {
      if (!entry || entry.key == null) { return }

      if (entry.type === 'put' && entry.value != null) on.push(entry.key)
      if (entry.type === 'del') off.push(entry.key)
    })

    if (on.length) {
      ttlon(db, on, options.ttl, done)
    } else {
      done()
    }

    if (off.length) {
      ttloff(db, off, done)
    } else {
      done()
    }
  }

  db._ttl.batch.call(db, arr, options, callback)
}

function close (db, callback) {
  stopTtl(db, function () {
    if (db._ttl && typeof db._ttl.close === 'function') {
      return db._ttl.close.call(db, callback)
    }
    callback && callback()
  })
}

function setup (db, options) {
  if (db._ttl) return

  options || (options = {})

  options = xtend({
    methodPrefix: '',
    namespace: options.sub ? '' : 'ttl',
    expiryNamespace: 'x',
    separator: '!',
    checkFrequency: 10000,
    defaultTTL: 0
  }, options)

  const _prefixNs = options.namespace ? [ options.namespace ] : []

  db._ttl = {
    put: db.put.bind(db),
    del: db.del.bind(db),
    batch: db.batch.bind(db),
    close: db.close.bind(db),
    sub: options.sub,
    options: options,
    encoding: encoding.create(options),
    _prefixNs: _prefixNs,
    _expiryNs: _prefixNs.concat(options.expiryNamespace),
    _lock: new Lock()
  }

  db[options.methodPrefix + 'put'] = put.bind(null, db)
  db[options.methodPrefix + 'del'] = del.bind(null, db)
  db[options.methodPrefix + 'batch'] = batch.bind(null, db)
  db[options.methodPrefix + 'ttl'] = setTtl.bind(null, db)
  db[options.methodPrefix + 'stop'] = stopTtl.bind(null, db)
  // we must intercept close()
  db.close = close.bind(null, db)

  startTtl(db, options.checkFrequency)

  return db
}

module.exports = setup
