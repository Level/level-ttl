exports.create = function createEncoding (options) {
  options || (options = {})

  if (options.ttlEncoding) return options.ttlEncoding

  const PATH_SEP = options.separator,
    INITIAL_SEP = options.sub ? '' : PATH_SEP

  function encodeElement (e) {
    // transform dates to timestamp strings
    return String(e instanceof Date ? +e : e)
  }

  return {
    buffer: false,
    encode: function (e) {
      // TODO: reexamine this with respect to level-sublevel@6's native codecs
      if (Array.isArray(e)) {
        return Buffer.from(INITIAL_SEP + e.map(encodeElement).join(PATH_SEP))
      }
      return Buffer.from(encodeElement(e))
    },
    decode: function (e) {
      // TODO: detect and parse ttl records
      return e.toString('utf8')
    }
  }
}
