const after = require('after')
    , xtend = require('xtend')

    , DEFAULT_FREQUENCY = 10000
    , QUERY_SEPARATOR   = 'x!'

function expirationKey (db, exp, key) {
  var separator = db._ttl.options.separator
  return queryStart(db) + exp + separator + key
}

function queryStart (db) {
  return prefix(db) + QUERY_SEPARATOR
}

function prefix (db) {
  if (db._ttl.sub)
    return ''

  var separator = db._ttl.options.separator
  var namespace = db._ttl.options.namespace
  return separator + namespace + separator
}

function startTtl (db, checkFrequency) {
  db._ttl.intervalId = setInterval(function () {
    var batch     = []
      , subBatch  = []
      , start     = queryStart(db)
      , sub       = db._ttl.sub
      , query     = {
            keyEncoding: 'utf8'
          , valueEncoding: 'utf8'
          , start: start
          , end: start + String(Date.now()) + '~'
        }
      , createReadStream

    db._ttl._checkInProgress = true

    if (sub)
      createReadStream = sub.createReadStream.bind(sub)
    else
      createReadStream = db.createReadStream.bind(db)

    createReadStream(query)
      .on('data', function (data) {
        // expirationKey that matches this query
        subBatch.push({ type: 'del', key: data.key })
        // the value is the key!
        subBatch.push({ type: 'del', key: prefix(db) + data.value })
        // the actual data that should expire now!
        batch.push({ type: 'del', key: data.value })
      })
      .on('error', db.emit.bind(db, 'error'))
      .on('end', function () {
        if (!batch.length)
          return

        pushUpdatingTtl(db)

        if (sub) {
          sub.batch(
              subBatch
            , { keyEncoding: 'utf8' }
            , function (err) {
                popUpdatingTtl(db)
                if (err)
                  db.emit('error', err)
              }
          )

          db._ttl.batch(
              batch
            , { keyEncoding: 'utf8' }
            , function (err) {
                if (err)
                  db.emit('error', err)
              }
          )
        }
        else {
          db._ttl.batch(
              subBatch.concat(batch)
            , { keyEncoding: 'utf8' }
            , function (err) {
                popUpdatingTtl(db)
                if (err)
                  db.emit('error', err)
              }
          )
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
  if (db._ttl.intervalId.unref)
    db._ttl.intervalId.unref()
}

function stopTtl (db, callback) {
  // can't close a db while an interator is in progress
  // so if one is, defer
  if (db._ttl._checkInProgress)
    return db._ttl._stopAfterCheck = callback
  clearInterval(db._ttl.intervalId)
  callback && callback()
}

function ttlon (db, keys, ttl, callback) {
  var exp     = String(Date.now() + ttl)
    , sub     = db._ttl.sub
    , batch   = []
    , batchFn = (sub ? sub.batch.bind(sub) : db._ttl.batch)

  if (!Array.isArray(keys))
    keys = [ keys ]

  pushUpdatingTtl(db)

  ttloff(db, keys, function () {
    keys.forEach(function (key) {
      if (typeof key != 'string')
        key = key.toString()
      batch.push({ type: 'put', key: expirationKey(db, exp, key), value: key })
      batch.push({ type: 'put', key: prefix(db) + key, value: exp })
    })

    if (!batch.length) {
      popUpdatingTtl(db)
      return callback && callback()
    }

    batchFn(
        batch
      , { keyEncoding: 'utf8', valueEncoding: 'utf8' }
      , function (err) {
          popUpdatingTtl(db)
          if (err)
            db.emit('error', err)
          callback && callback()
        }
    )
  })
}

function ttloff (db, keys, callback) {
  if (!Array.isArray(keys))
    keys = [ keys ]

  var batch   = []
    , sub     = db._ttl.sub
    , getFn   = (sub ? sub.get.bind(sub) : db.get.bind(db))
    , batchFn = (sub ? sub.batch.bind(sub) : db._ttl.batch)
    , done    = after(keys.length, function (err) {
        if (err)
          db.emit('error', err)

        if (!batch.length)
          return callback && callback()

        pushUpdatingTtl(db)

        batchFn(
            batch
          , { keyEncoding: 'utf8', valueEncoding: 'utf8' }
          , function (err) {
              popUpdatingTtl(db)
              if (err)
                db.emit('error', err)
              callback && callback()
            }
        )
      })

  keys.forEach(function (key) {
    if (typeof key != 'string')
      key = key.toString()

    getFn(
        prefix(db) + key
      , { keyEncoding: 'utf8', valueEncoding: 'utf8' }
      , function (err, exp) {
          if (!err && exp > 0) {
            batch.push({ type: 'del', key: expirationKey(db, exp, key) })
            batch.push({ type: 'del', key: prefix(db) + key })
          }
          done(err && err.name != 'NotFoundError' && err)
        }
    )
  })
}

function put (db, key, value, options, callback) {
  if (typeof options == 'function') {
    callback = options
    options = {}
  }

  options = options || {}

  if (db._ttl.options.defaultTTL > 0 && !options.ttl && options.ttl != 0) {
    options.ttl = db._ttl.options.defaultTTL
  }

  var done
    , _callback = callback

  if (options.ttl > 0
      && key !== null && key !== undefined
      && value !== null && value !== undefined) {

    done = after(2, _callback || function () {})
    callback = done
    ttlon(db, key, options.ttl, done)
  }

  db._ttl.put.call(db, key, value, options, callback)
}

function ttl (db, key, _ttl, callback) {
  if (_ttl > 0 && key !== null && key !== undefined)
    ttlon(db, key, _ttl, callback)
}

function del (db, key, options, callback) {
  var done
    , _callback = callback
  if (key !== null && key !== undefined) {
    done = after(2, _callback || function () {})
    callback = done
    ttloff(db, key, done)
  }

  db._ttl.del.call(db, key, options, callback)
}

function batch (db, arr, options, callback) {
  if (typeof options == 'function') {
    callback = options
    options = {}
  }

  options = options || {}

  if (db._ttl.options.defaultTTL > 0 && !options.ttl && options.ttl != 0) {
    options.ttl = db._ttl.options.defaultTTL
  }

  var done
    , on
    , off
    , _callback = callback

  if (options.ttl > 0 && Array.isArray(arr)) {
    done = after(3, _callback || function () {})
    callback = done

    on  = []
    off = []
    arr.forEach(function (entry) {
      if (!entry || entry.key === null || entry.key === undefined)
        return

      if (entry.type == 'put' && entry.value !== null && entry.value !== undefined)
        on.push(entry.key)
      if (entry.type == 'del')
        off.push(entry.key)
    })

    pushUpdatingTtl(db)

    if (on.length)
      ttlon(db, on, options.ttl, done)
    else
      done()
    if (off.length)
      ttloff(db, off, done)
    else
      done()

    popUpdatingTtl(db)
  }

  db._ttl.batch.call(db, arr, options, callback)
}

function close (db, callback) {
  stopTtl(db, function () {
    if (db._ttl && typeof db._ttl.close == 'function')
      return db._ttl.close.call(db, callback)
    callback && callback()
  })
}

function pushUpdatingTtl (db) {
  ++db._ttl.updating
}

function popUpdatingTtl (db) {
  --db._ttl.updating
}

function isUpdatingTtl (db) {
  return db._ttl.updating > 0
}

function setup (db, options) {
  if (db._ttl)
    return

  options = options || {}

  options = xtend({
      methodPrefix   : ''
    , namespace      : 'ttl'
    , separator      : '!'
    , checkFrequency : DEFAULT_FREQUENCY
    , defaultTTL     : 0
  }, options)

  db._ttl = {
      put      : db.put.bind(db)
    , del      : db.del.bind(db)
    , batch    : db.batch.bind(db)
    , close    : db.close.bind(db)
    , sub      : options.sub
    , options  : options
    , updating : 0
  }

  db[options.methodPrefix + 'put']           = put.bind(null, db)
  db[options.methodPrefix + 'del']           = del.bind(null, db)
  db[options.methodPrefix + 'batch']         = batch.bind(null, db)
  db[options.methodPrefix + 'ttl']           = ttl.bind(null, db)
  db[options.methodPrefix + 'stop']          = stopTtl.bind(null, db)
  db[options.methodPrefix + 'isUpdatingTtl'] = isUpdatingTtl.bind(null, db)
  // we must intercept close()
  db.close                           = close.bind(null, db)

  startTtl(db, options.checkFrequency)

  return db
}

module.exports = setup
