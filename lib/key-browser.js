/**
 * key.js - key compiler for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const keyCache = Object.create(null);

const MIN160 = '0000000000000000000000000000000000000000';
const MAX160 = 'ffffffffffffffffffffffffffffffffffffffff';
const MIN256 =
  '0000000000000000000000000000000000000000000000000000000000000000';
const MAX256 =
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

/*
 * Key Ops
 */

const types = {
  uint8: {
    min: 0,
    max: 0xff,
    dynamic: false,
    end: false,
    size(v) {
      return 2;
    },
    read(k, o) {
      assertLen(o + 2 <= k.length);
      return parseNum(k, o, 2);
    },
    write(v) {
      assertType((v & 0xff) === v);
      if (v <= 0x0f)
        return `0${v.toString(16)}`;
      return v.toString(16);
    }
  },
  uint16: {
    min: 0,
    max: 0xffff,
    dynamic: false,
    end: false,
    size(v) {
      return 4;
    },
    read(k, o) {
      assertLen(o + 4 <= k.length);
      return parseNum(k, o, 4);
    },
    write(v) {
      assertType((v & 0xffff) === v);
      v = v.toString(16);
      switch (v.length) {
        case 1:
          return `000${v}`;
        case 2:
          return `00${v}`;
        case 3:
          return `0${v}`;
        case 4:
          return v;
      }
    }
  },
  uint32: {
    min: 0,
    max: 0xffffffff,
    dynamic: false,
    end: false,
    size(v) {
      return 8;
    },
    read(k, o) {
      assertLen(o + 8 <= k.length);
      return parseNum(k, o, 8);
    },
    write(v) {
      assertType((v >>> 0) === v);
      v = v.toString(16);
      switch (v.length) {
        case 1:
          return `0000000${v}`;
        case 2:
          return `000000${v}`;
        case 3:
          return `00000${v}`;
        case 4:
          return `0000${v}`;
        case 5:
          return `000${v}`;
        case 6:
          return `00${v}`;
        case 7:
          return `0${v}`;
        case 8:
          return v;
      }
    }
  },
  hash160: {
    min: MIN160,
    max: MAX160,
    dynamic: false,
    end: false,
    size(v) {
      return 40;
    },
    read(k, o) {
      assertLen(o + 40 <= k.length);
      return k.substring(o, o + 40);
    },
    write(v) {
      return writeHex(v, 40);
    }
  },
  hash256: {
    min: MIN256,
    max: MAX256,
    dynamic: false,
    end: false,
    size(v) {
      return 64;
    },
    read(k, o) {
      assertLen(o + 64 <= k.length);
      return k.substring(o, o + 64);
    },
    write(v) {
      return writeHex(v, 64);
    }
  },
  buffer: {
    min: '00',
    max: 'ff',
    dynamic: true,
    end: true,
    size(v) {
      return sizeHex(v);
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      return Buffer.from(k.substring(o), 'hex');
    },
    write(v) {
      const size = sizeHex(v);
      return writeHex(v, size);
    }
  },
  hash: {
    min: MIN160,
    max: MAX256,
    dynamic: true,
    end: true,
    size(v) {
      return sizeHex(v);
    },
    read(k, o) {
      const size = k.length - o;
      assertLen(size === 40 || size === 64);
      return k.substring(o);
    },
    write(v) {
      const size = sizeHex(v);
      assertType(size === 40 || size === 64);
      return writeHex(v, size);
    }
  },
  phash: {
    min: MIN160,
    max: MAX256,
    dynamic: true,
    end: false,
    size(v) {
      return 2 + sizeHex(v);
    },
    read(k, o) {
      const size = parseNum(k, o, 2) << 1;
      assertLen(size === 40 || size === 64);
      assertLen(o + 2 + size <= k.length);
      return k.substring(o + 2, o + 2 + size);
    },
    write(v) {
      const size = sizeHex(v);
      assertType(size === 40 || size === 64);
      let s = (size >>> 1).toString(16);
      if (s.length < 2)
        s = `0${s}`;
      return s + writeHex(v, size);
    }
  },
  char: {
    min: '\x00',
    max: '\xff',
    dynamic: false,
    end: false,
    size(v) {
      return 1;
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      return k[o];
    },
    write(v) {
      assertType(typeof v === 'string');
      assertType(v.length === 1);
      return v;
    }
  },
  ascii: {
    min: '\x00',
    max: '\xff',
    dynamic: true,
    end: true,
    size(v) {
      assertType(typeof v === 'string');
      return v.length;
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      return k.substring(o);
    },
    write(v) {
      assertType(typeof v === 'string');
      return v;
    }
  },
  utf8: {
    min: '\u0000',
    max: '\ufffd',
    dynamic: true,
    end: true,
    size(v) {
      assertType(typeof v === 'string')
      return v.length;
    },
    read(k, o) {
      assertLen(o + 1 <= k.length);
      return k.substring(o);
    },
    write(v) {
      assertType(typeof v === 'string');
      return v;
    }
  }
};

Key.buffer = false;

/**
 * BaseKey
 * @ignore
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
    this.dynamic = false;

    this.init(ops);
  }

  static create(ops) {
    const hash = ops ? ops.join(':') : '';
    const cache = keyCache[hash];

    if (cache)
      return cache;

    const key = new BaseKey(ops);
    keyCache[hash] = key;

    return key;
  }

  init(ops) {
    for (let i = 0; i < ops.length; i++) {
      const name = ops[i];

      assert(typeof name === 'string');

      const op = types[name];

      if (!op)
        throw new Error(`Invalid type name: ${name}.`);

      if (op.dynamic) {
        if (op.end && i !== ops.length - 1)
          throw new Error(`Variable type ${name} precedes end.`);

        this.dynamic = true;
      } else {
        assert(!op.end);
        this.size += op.size();
      }

      this.ops.push(op);
    }
  }

  getSize(args) {
    assert(args.length === this.ops.length);

    let size = 2 + this.size;

    if (!this.dynamic)
      return size;

    for (let i = 0; i < args.length; i++) {
      const op = this.ops[i];
      const arg = args[i];
      if (op.dynamic)
        size += op.size(arg);
    }

    return size;
  }

  build(id, args) {
    assert(Array.isArray(args));

    if (args.length !== this.ops.length)
      throw new Error('Wrong number of arguments passed to key.');

    let key = id;

    for (let i = 0; i < this.ops.length; i++) {
      const op = this.ops[i];
      const arg = args[i];
      key += op.write(arg);
    }

    return key;
  }

  parse(id, key) {
    assert(typeof key === 'string');

    if (this.ops.length === 0)
      return key;

    if (key.length < 2 || key[0] !== id[0] || key[1] !== id[1])
      throw new Error('Key prefix mismatch.');

    const args = [];

    let offset = 2;

    for (const op of this.ops) {
      const arg = op.read(key, offset);
      offset += op.size(arg);
      args.push(arg);
    }

    if (args.length === 1)
      return args[0];

    return args;
  }

  min(id, args) {
    for (let i = args.length; i < this.ops.length; i++) {
      const op = this.ops[i];
      args.push(op.min);
    }
    return this.build(id, args);
  }

  max(id, args) {
    for (let i = args.length; i < this.ops.length; i++) {
      const op = this.ops[i];
      args.push(op.max);
    }
    return this.build(id, args);
  }

  root(id) {
    return id;
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

    this.id = makeID(id);
    this.base = BaseKey.create(ops);
  }

  build(...args) {
    return this.base.build(this.id, args);
  }

  parse(key) {
    return this.base.parse(this.id, key);
  }

  min(...args) {
    return this.base.min(this.id, args);
  }

  max(...args) {
    return this.base.max(this.id, args);
  }

  root() {
    return this.base.root(this.id);
  }
}

/*
 * Helpers
 */

function makeID(id) {
  if (typeof id === 'string') {
    assert(id.length === 1);
    id = id.charCodeAt(0);
  }

  assert((id & 0xff) === id);
  assert(id !== 0xff);

  if (id <= 0x0f)
    return `0${id.toString(16)}`;

  return id.toString(16);
}

function writeHex(str, size) {
  if (Buffer.isBuffer(str))
    str = str.toString('hex');
  assert(typeof str === 'string');
  assert(str.length === size);
  return str;
}

function sizeHex(data) {
  if (Buffer.isBuffer(data))
    return data.length * 2;
  assert(typeof data === 'string');
  return data.length;
}

function assertLen(ok) {
  if (!ok) {
    const err = new Error('Invalid length for database key.');
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

function parseNum(str, off, size) {
  return parseInt(str.substring(off, off + size), 16) >>> 0;
}

/*
 * Expose
 */

module.exports = Key;
