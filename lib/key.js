/**
 * key.js - key compiler for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');

/*
 * Constants
 */

const keyCache = Object.create(null);

const BUFFER_MIN = Buffer.alloc(0);
const BUFFER_MAX = Buffer.alloc(255, 0xff);

/*
 * Key Ops
 */

const types = {
  char: {
    min: '\x00',
    max: '\xff',
    dynamic: false,
    size(v) {
      return 1;
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      return String.fromCharCode(k[o]);
    },
    write(k, v, o) {
      assertType(typeof v === 'string');
      assertType(v.length === 1);
      assertLen(o + 1 <= k.length);

      k[o] = v.charCodeAt(0);

      return 1;
    }
  },
  uint8: {
    min: 0,
    max: 0xff,
    dynamic: false,
    size(v) {
      return 1;
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      return k[o];
    },
    write(k, v, o) {
      assertType((v & 0xff) === v);
      assertLen(o + 1 <= k.length);

      k[o] = v;

      return 1;
    }
  },
  uint16: {
    min: 0,
    max: 0xffff,
    dynamic: false,
    size(v) {
      return 2;
    },
    read(k, o) {
      assertLen(o + 2 <= k.length);
      return readU16BE(k, o);
    },
    write(k, v, o) {
      assertType((v & 0xffff) === v);
      assertLen(o + 2 <= k.length);

      writeU16BE(k, v, o);

      return 2;
    }
  },
  uint32: {
    min: 0,
    max: 0xffffffff,
    dynamic: false,
    size(v) {
      return 4;
    },
    read(k, o) {
      assertLen(o + 4 <= k.length);
      return readU32BE(k, o);
    },
    write(k, v, o) {
      assertType((v >>> 0) === v);
      assertLen(o + 4 <= k.length);

      writeU32BE(k, v, o);

      return 4;
    }
  },
  uint64: {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    dynamic: false,
    size(v) {
      return 8;
    },
    read(k, o) {
      assertLen(o + 8 <= k.length);
      return readU64BE(k, o);
    },
    write(k, v, o) {
      assertType(Number.isSafeInteger(v) && v >= 0);
      assertLen(o + 8 <= k.length);

      writeU64BE(k, v, o);

      return 8;
    }
  },
  buffer: {
    min: BUFFER_MIN,
    max: BUFFER_MAX,
    dynamic: true,
    size(v) {
      return sizeBuffer(v);
    },
    read(k, o) {
      return readBuffer(k, o);
    },
    write(k, v, o) {
      return writeBuffer(k, v, o);
    }
  },
  hex: {
    min: BUFFER_MIN.toString('hex'),
    max: BUFFER_MAX.toString('hex'),
    dynamic: true,
    size(v) {
      return sizeString(v, 'hex');
    },
    read(k, o) {
      return readString(k, o, 'hex');
    },
    write(k, v, o) {
      return writeString(k, v, o, 'hex');
    }
  },
  ascii: {
    min: BUFFER_MIN.toString('binary'),
    max: BUFFER_MAX.toString('binary'),
    dynamic: true,
    size(v) {
      return sizeString(v, 'binary');
    },
    read(k, o) {
      return readString(k, o, 'binary');
    },
    write(k, v, o) {
      return writeString(k, v, o, 'binary');
    }
  },
  utf8: {
    min: BUFFER_MIN.toString('utf8'),
    max: BUFFER_MAX.toString('utf8'),
    dynamic: true,
    size(v) {
      return sizeString(v, 'utf8');
    },
    read(k, o) {
      return readString(k, o, 'utf8');
    },
    write(k, v, o) {
      return writeString(k, v, o, 'utf8');
    }
  },
  hash160: {
    min: Buffer.alloc(20, 0x00),
    max: Buffer.alloc(20, 0xff),
    dynamic: false,
    size(v) {
      return 20;
    },
    read(k, o) {
      assertLen(o + 20 <= k.length);
      return k.slice(o, o + 20);
    },
    write(k, v, o) {
      assertType(Buffer.isBuffer(v));
      assertType(v.copy(k, o) === 20);
      return 20;
    }
  },
  hash256: {
    min: Buffer.alloc(32, 0x00),
    max: Buffer.alloc(32, 0xff),
    dynamic: false,
    size(v) {
      return 32;
    },
    read(k, o) {
      assertLen(o + 32 <= k.length);
      return k.slice(o, o + 32);
    },
    write(k, v, o) {
      assertType(Buffer.isBuffer(v));
      assertType(v.copy(k, o) === 32);
      return 32;
    }
  },
  hash: {
    min: Buffer.alloc(1, 0x00),
    max: Buffer.alloc(64, 0xff),
    dynamic: true,
    size(v) {
      assertType(Buffer.isBuffer(v));
      return 1 + v.length;
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      assertLen(k[o] >= 1 && k[o] <= 64);
      assertLen(o + 1 + k[o] <= k.length);

      return k.slice(o + 1, o + 1 + k[o]);
    },
    write(k, v, o) {
      assertType(Buffer.isBuffer(v));
      assertType(v.length >= 1 && v.length <= 64);
      assertLen(o + 1 <= k.length);

      k[o] = v.length;

      assertType(v.copy(k, o + 1) === v.length);

      return 1 + v.length;
    }
  },
  hhash160: {
    min: Buffer.alloc(20, 0x00),
    max: Buffer.alloc(20, 0xff),
    dynamic: false,
    size(v) {
      return 20;
    },
    read(k, o) {
      assertLen(o + 20 <= k.length);
      return k.toString('hex', o, o + 20);
    },
    write(k, v, o) {
      assertType(writeHex(k, v, o) === 20);
      return 20;
    }
  },
  hhash256: {
    min: Buffer.alloc(32, 0x00),
    max: Buffer.alloc(32, 0xff),
    dynamic: false,
    size(v) {
      return 32;
    },
    read(k, o) {
      assertLen(o + 32 <= k.length);
      return k.toString('hex', o, o + 32);
    },
    write(k, v, o) {
      assertType(writeHex(k, v, o) === 32);
      return 32;
    }
  },
  hhash: {
    min: Buffer.alloc(1, 0x00),
    max: Buffer.alloc(64, 0xff),
    dynamic: true,
    size(v) {
      return 1 + sizeHex(v);
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      assertLen(k[o] >= 1 && k[o] <= 64);
      assertLen(o + 1 + k[o] <= k.length);

      return k.toString('hex', o + 1, o + 1 + k[o]);
    },
    write(k, v, o) {
      const size = sizeHex(v);

      assertType(size >= 1 && size <= 64);
      assertLen(o + 1 <= k.length);

      k[o] = size;

      assertType(writeHex(k, v, o + 1) === size);

      return 1 + size;
    }
  }
};

/**
 * BaseKey
 */

class BaseKey {
  /**
   * Create a base key.
   * @constructor
   * @param {String[]|null} ops
   */

  constructor(ops = []) {
    assert(Array.isArray(ops));

    this.ops = [];
    this.size = 0;
    this.index = -1;

    this.init(ops);
  }

  /**
   * @param {String[]} [ops]
   * @returns {BaseKey}
   */

  static create(ops) {
    const hash = ops ? ops.join(':') : '';
    const cache = keyCache[hash];

    if (cache)
      return cache;

    const key = new BaseKey(ops);

    keyCache[hash] = key;

    return key;
  }

  /**
   * @param {String[]} ops
   * @returns {void}
   */

  init(ops) {
    for (let i = 0; i < ops.length; i++) {
      const name = ops[i];

      assert(typeof name === 'string');

      // eslint-disable-next-line no-prototype-builtins
      if (!types.hasOwnProperty(name))
        throw new Error(`Invalid type name: ${name}.`);

      const op = types[name];

      if (op.dynamic) {
        if (this.index === -1)
          this.index = i;
      } else {
        this.size += op.size();
      }

      this.ops.push(op);
    }
  }

  /**
   * @param {Buffer} id
   * @param {Array} args
   * @returns {Number}
   */

  getSize(id, args) {
    assert(args.length === this.ops.length);

    let size = id.length + this.size;

    if (this.index === -1)
      return size;

    for (let i = this.index; i < args.length; i++) {
      const op = this.ops[i];
      const arg = args[i];

      if (op.dynamic)
        size += op.size(arg);
    }

    return size;
  }

  /**
   * @param {Buffer} id
   * @param {Array} args
   * @returns {Buffer}
   */

  encode(id, args) {
    assert(Array.isArray(args));

    if (args.length !== this.ops.length)
      throw new Error('Wrong number of arguments passed to key.');

    const size = this.getSize(id, args);
    const key = Buffer.allocUnsafe(size);

    id.copy(key);

    let offset = id.length;

    for (let i = 0; i < this.ops.length; i++) {
      const op = this.ops[i];
      const arg = args[i];

      offset += op.write(key, arg, offset);
    }

    return key;
  }

  /**
   * @param {Buffer} id
   * @param {Buffer} key
   * @returns {Array}
   */

  decode(id, key) {
    assert(Buffer.isBuffer(key));

    if (this.ops.length === 0)
      return [];

    if (!prefixMatches(id, key))
      throw new Error('Key prefix mismatch.');

    const args = [];

    let offset = id.length;

    for (const op of this.ops) {
      const arg = op.read(key, offset);

      offset += op.size(arg);

      args.push(arg);
    }

    return args;
  }

  /**
   * @param {Buffer} id
   * @param {Array} args
   * @returns {Buffer}
   */

  min(id, args) {
    for (let i = args.length; i < this.ops.length; i++) {
      const op = this.ops[i];

      args.push(op.min);
    }

    return this.encode(id, args);
  }

  /**
   * @param {Buffer} id
   * @param {Array} args
   * @returns {Buffer}
   */

  max(id, args) {
    for (let i = args.length; i < this.ops.length; i++) {
      const op = this.ops[i];

      args.push(op.max);
    }

    return this.encode(id, args);
  }

  /**
   * @param {Buffer} id
   * @returns {Buffer}
   */

  root(id) {
    const key = Buffer.allocUnsafe(id.length);
    id.copy(key);
    return key;
  }
}

/**
 * Key
 * @ignore
 */

class Key {
  /**
   * Create a key.
   * @constructor
   * @param {Number|String} id
   * @param {String[]|null} ops
   */

  constructor(id, ops = []) {
    assert(Array.isArray(ops));

    /** @type {Buffer} */
    this.id = makeID(id);

    /** @type {BaseKey} */
    this.base = BaseKey.create(ops);
  }

  /**
   * @param {Array} args
   * @returns {Buffer}
   */

  encode(...args) {
    return this.base.encode(this.id, args);
  }

  /**
   * @param {Buffer} key
   * @returns {Array}
   */

  decode(key) {
    return this.base.decode(this.id, key);
  }

  /**
   * @param {Array} args
   * @returns {Buffer}
   */

  min(...args) {
    return this.base.min(this.id, args);
  }

  /**
   * @param {Array} args
   * @returns {Buffer}
   */

  max(...args) {
    return this.base.max(this.id, args);
  }

  /**
   * @returns {Buffer}
   */

  root() {
    return this.base.root(this.id);
  }
}

/*
 * Helpers
 */

/**
 * @param {Number|String|Buffer} id
 * @returns {Buffer}
 */

function makeID(id) {
  if (typeof id === 'string')
    id =  Buffer.from(id, 'ascii');

  // Number is not supported for multi-byte ids.
  if (typeof id === 'number') {
    assert((id & 0xff) === id);
    assert(id !== 0xff);

    id =  Buffer.from([id]);
  }

  assert(Buffer.isBuffer(id));
  return id;
}

/**
 * @param {Buffer} id
 * @param {Buffer} key
 * @returns {Boolean}
 */

function prefixMatches(id, key) {
  if (key.length === 0)
    return false;

  if (key.length < id.length)
    return false;

  return key.slice(0, id.length).equals(id);
}

/**
 * @param {String} v
 * @param {BufferEncoding} [enc]
 * @returns {Number}
 */

function sizeString(v, enc) {
  assertType(typeof v === 'string');
  return 1 + Buffer.byteLength(v, enc);
}

/**
 * @param {Buffer} k
 * @param {Number} o
 * @param {BufferEncoding} [enc]
 * @returns {String}
 */

function readString(k, o, enc) {
  assertLen(o + 1 <= k.length);
  assertLen(o + 1 + k[o] <= k.length);

  return k.toString(enc, o + 1, o + 1 + k[o]);
}

/**
 * @param {Buffer} k
 * @param {String} v
 * @param {Number} o
 * @param {BufferEncoding} [enc]
 * @returns {Number}
 */

function writeString(k, v, o, enc) {
  assertType(typeof v === 'string');

  const size = Buffer.byteLength(v, enc);

  assertType(size <= 255);
  assertLen(o + 1 <= k.length);

  k[o] = size;

  if (size > 0)
    assertType(k.write(v, o + 1, enc) === size);

  return 1 + size;
}

/**
 * @param {Buffer} v
 * @returns {Number}
 */

function sizeBuffer(v) {
  assertType(Buffer.isBuffer(v));
  return 1 + v.length;
}

/**
 * @param {Buffer} k
 * @param {Number} o
 * @returns {Buffer}
 */

function readBuffer(k, o) {
  assertLen(o + 1 <= k.length);
  assertLen(o + 1 + k[o] <= k.length);

  return k.slice(o + 1, o + 1 + k[o]);
}

/**
 * @param {Buffer} k
 * @param {Buffer} v
 * @param {Number} o
 * @returns {Number}
 */

function writeBuffer(k, v, o) {
  assertType(Buffer.isBuffer(v));
  assertLen(v.length <= 255);
  assertLen(o + 1 <= k.length);

  k[o] = v.length;

  assertLen(v.copy(k, o + 1) === v.length);

  return 1 + v.length;
}

/**
 * @param {Buffer|String} data
 * @returns {Number}
 */

function sizeHex(data) {
  if (Buffer.isBuffer(data))
    return data.length;

  assertType(typeof data === 'string');

  return data.length >>> 1;
}

/**
 * @param {Buffer} data
 * @param {String} str
 * @param {Number} off
 * @returns {Number}
 */

function writeHex(data, str, off) {
  if (Buffer.isBuffer(str))
    return str.copy(data, off);

  assertType(typeof str === 'string');

  return data.write(str, off, 'hex');
}

function assertLen(ok) {
  if (!ok) {
    const err = new RangeError('Invalid length for database key.');

    if (Error.captureStackTrace)
      Error.captureStackTrace(err, assertLen);

    throw err;
  }
}

function assertType(ok) {
  if (!ok) {
    const err = new TypeError('Invalid type for database key.');

    if (Error.captureStackTrace)
      Error.captureStackTrace(err, assertType);

    throw err;
  }
}

function readU64BE(data, off) {
  const hi = readU32BE(data, off);
  const lo = readU32BE(data, off + 4);
  return hi * 0x100000000 + lo;
}

function readU32BE(data, off) {
  return (data[off++] * 0x1000000
        + data[off++] * 0x10000
        + data[off++] * 0x100
        + data[off]);
}

function readU16BE(data, off) {
  return data[off++] * 0x100 + data[off];
}

function writeU64BE(dst, num, off) {
  const hi = (num * (1 / 0x100000000)) | 0;
  const lo = num | 0;
  off = writeU32BE(dst, hi, off);
  off = writeU32BE(dst, lo, off);
  return off;
}

function writeU32BE(dst, num, off) {
  dst[off + 3] = num;
  num >>>= 8;
  dst[off + 2] = num;
  num >>>= 8;
  dst[off + 1] = num;
  num >>>= 8;
  dst[off] = num;
  return off + 4;
}

function writeU16BE(dst, num, off) {
  dst[off++] = num >>> 8;
  dst[off++] = num;
  return off;
}

/*
 * Expose
 */

module.exports = Key;
