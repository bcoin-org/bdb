/*!
 * db.js - LevelUP module for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const asyncIterator = Symbol.asyncIterator || 'asyncIterator';

/**
 * Constants
 */

const LOW = Buffer.alloc(1, 0x00);
const HIGH = Buffer.alloc(255, 0xff);

/*
 * Iterator
 */

const ITER_TYPE_KEYS = 0;
const ITER_TYPE_VALUES = 1;
const ITER_TYPE_KEY_VAL = 2;

/**
 * Iteration types.
 * @enum {Number}
 */

const iteratorTypes = {
  ITER_TYPE_KEYS,
  ITER_TYPE_VALUES,
  ITER_TYPE_KEY_VAL
};

/** @typedef {import('./memdb')} MemDB */
/** @typedef {import('./level')} LevelDB */

/**
 * @typedef {Object} MemDBClass
 * @property {(location: string, callback: function) => void} destroy
 * @property {(location: string, callback: function) => void} repair
 * @property {(location: string) => void} backup
 */
/**
 * @typedef {Object} LevelDBClass
 * @property {(location: string, callback: function) => void} destroy
 * @property {(location: string, callback: function) => void} repair
 * @property {(location: string) => void} backup
 */

/**
 * @typedef {Object} IterOptions
 * @property {Buffer} [gte]
 * @property {Buffer} [gt]
 * @property {Buffer} [lte]
 * @property {Buffer} [lt]
 * @property {boolean} [keys]
 * @property {boolean} [values]
 * @property {boolean} [fillCache]
 * @property {boolean} [reverse]
 * @property {number} [limit]
 */

/**
 * @template T
 * @typedef {Object} RangeOptions
 * @property {Buffer} [gte]
 * @property {Buffer} [gt]
 * @property {Buffer} [lte]
 * @property {Buffer} [lt]
 * @property {boolean} [reverse]
 * @property {number} [limit]
 * @property {EachCallback<T>} [parse]
 */

/**
 * @template T
 * @typedef {Object} KeysOptions
 * @property {Buffer} [gte]
 * @property {Buffer} [gt]
 * @property {Buffer} [lte]
 * @property {Buffer} [lt]
 * @property {boolean} [reverse]
 * @property {number} [limit]
 * @property {KeysCallback<T>} [parse]
 */

/**
 * @template T
 * @typedef {Object} ValuesOptions
 * @property {Buffer} [gte]
 * @property {Buffer} [gt]
 * @property {Buffer} [lte]
 * @property {Buffer} [lt]
 * @property {boolean} [reverse]
 * @property {number} [limit]
 * @property {ValuesCallback<T>} [parse]
 */

/**
 * @template T
 * @callback EachCallback
 * @param {Buffer} key
 * @param {Buffer} value
 * @returns {T}
 */

/**
 * @template T
 * @callback KeysCallback
 * @param {Buffer} key
 * @returns {T}
 */

/**
 * @template T
 * @callback ValuesCallback
 * @param {Buffer} value
 * @returns {T}
 */

/**
 * DB
 */

class DB {
  /** @type {DBOptions} */
  options;

  /** @type {LevelDBClass|MemDBClass} */
  backend;

  /** @type {String} */
  location;

  /** @type {boolean} */
  loading;

  /** @type {boolean} */
  closing;

  /** @type {boolean} */
  loaded;

  /** @type {boolean} */
  leveldown;

  /** @type {LevelDB|MemDB} */
  binding;

  /**
   * Create a DB instance.
   * @constructor
   * @param {MemDBClass|LevelDBClass} backend - Database backend.
   * @param {String} location - File location.
   * @param {Object?} options - Leveldown options.
   */

  constructor(backend, location, options) {
    assert(typeof backend === 'function', 'Backend is required.');
    assert(typeof location === 'string', 'Filename is required.');

    this.options = new DBOptions(options);
    this.backend = backend;
    this.location = location;

    this.loading = false;
    this.closing = false;
    this.loaded = false;

    this.binding = null;
    this.leveldown = false;

    this.init();
  }

  /**
   * Initialize the database.
   * @private
   */

  init() {
    const Backend = this.backend;

    // A lower-level binding.
    // @ts-ignore
    if (Backend.leveldown) {
      // @ts-ignore
      this.binding = new Backend(this.location);
      this.leveldown = true;
    } else {
      // @ts-ignore
      this.binding = new Backend(this.location);
    }
  }

  /**
   * Open the database.
   * @returns {Promise}
   */

  async open() {
    if (this.loaded)
      throw new Error('Database is already open.');

    assert(!this.loading);
    assert(!this.closing);

    try {
      this.loading = true;
      await this.load();
    } finally {
      this.loading = false;
    }

    this.loaded = true;
  }

  /**
   * Close the database.
   * @returns {Promise}
   */

  async close() {
    if (!this.loaded)
      throw new Error('Database is already closed.');

    assert(!this.loading);
    assert(!this.closing);

    try {
      this.loaded = false;
      this.closing = true;
      await this.unload();
    } catch (e) {
      this.loaded = true;
      throw e;
    } finally {
      this.closing = false;
    }
  }

  /**
   * Open the database.
   * @private
   * @returns {Promise}
   */

  load() {
    return new Promise((resolve, reject) => {
      this.binding.open(this.options, wrap(resolve, reject));
    });
  }

  /**
   * Close the database.
   * @private
   * @returns {Promise}
   */

  unload() {
    return new Promise((resolve, reject) => {
      this.binding.close(wrap(resolve, reject));
    });
  }

  /**
   * Destroy the database.
   * @returns {Promise}
   */

  destroy() {
    return new Promise((resolve, reject) => {
      if (this.loaded || this.closing) {
        reject(new Error('Cannot destroy open database.'));
        return;
      }

      if (!this.backend.destroy) {
        reject(new Error('Cannot destroy (method not available).'));
        return;
      }

      this.backend.destroy(this.location, wrap(resolve, reject));
    });
  }

  /**
   * Repair the database.
   * @returns {Promise}
   */

  repair() {
    return new Promise((resolve, reject) => {
      if (this.loaded || this.closing) {
        reject(new Error('Cannot repair open database.'));
        return;
      }

      if (!this.backend.repair) {
        reject(new Error('Cannot repair (method not available).'));
        return;
      }

      this.backend.repair(this.location, wrap(resolve, reject));
    });
  }

  /**
   * Backup the database.
   * @param {String} path
   * @returns {Promise}
   */

  backup(path) {
    return this.clone(path);
  }

  /**
   * Create a bucket.
   * @param {Buffer} prefix
   * @returns {Bucket}
   */

  bucket(prefix) {
    return new Bucket(this, prefix);
  }

  /**
   * Get root bucket.
   * @returns {DB}
   */

  root() {
    return this;
  }

  /**
   * Get child bucket.
   * @param {Buffer} prefix
   * @returns {Bucket}
   */

  child(prefix) {
    return this.bucket(prefix);
  }

  /**
   * Wrap a batch or iterator.
   * @param {Object} obj
   * @returns {Object}
   */

  wrap(obj) {
    return obj.root();
  }

  /**
   * Retrieve a record from the database.
   * @param {Buffer} key
   * @returns {Promise<Buffer>} - Returns Buffer.
   */

  get(key) {
    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }

      if (!Buffer.isBuffer(key)) {
        reject(new Error('Key must be a buffer.'));
        return;
      }

      this.binding.get(key, (err, result) => {
        if (err) {
          if (isNotFound(err)) {
            resolve(null);
            return;
          }

          reject(err);
          return;
        }

        resolve(result);
      });
    });
  }

  /**
   * Store a record in the database.
   * @param {Buffer} key
   * @param {Buffer} value
   * @returns {Promise}
   */

  put(key, value) {
    if (value == null)
      value = LOW;

    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }

      if (!Buffer.isBuffer(key) || !Buffer.isBuffer(value)) {
        reject(new Error('Key and value must be buffers.'));
        return;
      }

      this.binding.put(key, value, wrap(resolve, reject));
    });
  }

  /**
   * Remove a record from the database.
   * @param {Buffer} key
   * @returns {Promise}
   */

  del(key) {
    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }

      if (!Buffer.isBuffer(key)) {
        reject(new Error('Key must be a buffer.'));
        return;
      }

      this.binding.del(key, wrap(resolve, reject));
    });
  }

  /**
   * Create an atomic batch.
   * @returns {Batch}
   */

  batch() {
    if (!this.loaded)
      throw new Error('Database is closed.');

    return new Batch(this.binding.batch());
  }

  /**
   * Create an iterator.
   * @param {IterOptions} options
   * @returns {Iterator}
   */

  iterator(options) {
    if (!this.loaded)
      throw new Error('Database is closed.');

    return new Iterator(this, options);
  }

  /**
   * Get a database property.
   * @param {String} name - Property name.
   * @returns {String}
   */

  getProperty(name) {
    if (!this.loaded)
      throw new Error('Database is closed.');

    if (!this.binding.getProperty)
      return '';

    return this.binding.getProperty(name);
  }

  /**
   * Calculate approximate database size.
   * @param {Buffer|null} start - Start key.
   * @param {Buffer|null} end - End key.
   * @returns {Promise<Number>} - Returns Number.
   */

  approximateSize(start, end) {
    if (start == null)
      start = LOW;

    if (end == null)
      end = HIGH;

    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }

      if (!this.binding.approximateSize) {
        reject(new Error('Cannot get size.'));
        return;
      }

      if (!Buffer.isBuffer(start) || !Buffer.isBuffer(end)) {
        reject(new Error('Start and end must be buffers.'));
        return;
      }

      this.binding.approximateSize(start, end, wrap(resolve, reject));
    });
  }

  /**
   * Compact range of keys.
   * @param {Buffer|null} start - Start key.
   * @param {Buffer|null} end - End key.
   * @returns {Promise}
   */

  compactRange(start, end) {
    if (start == null)
      start = LOW;

    if (end == null)
      end = HIGH;

    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }

      if (!this.binding.compactRange) {
        resolve();
        return;
      }

      if (!Buffer.isBuffer(start) || !Buffer.isBuffer(end)) {
        reject(new Error('Start and end must be buffers.'));
        return;
      }

      this.binding.compactRange(start, end, wrap(resolve, reject));
    });
  }

  /**
   * Test whether a key exists.
   * @param {Buffer} key
   * @returns {Promise<Boolean>} - Returns Boolean.
   */

  async has(key) {
    const value = await this.get(key);
    return value != null;
  }

  /**
   * Collect all keys from iterator options.
   * @template T
   * @param {RangeOptions<T>} [options] - Iterator options.
   * @returns {Promise<IteratorItem[]|T[]>} - Returns Array.
   */

  async range(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: true
    });

    return iter.range(options.parse);
  }

  /**
   * Collect all keys from iterator options.
   * @template T
   * @param {KeysOptions<T>} [options] - Iterator options.
   * @returns {Promise<Array>} - Returns Array.
   */

  async keys(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: false
    });

    return iter.keys(options.parse);
  }

  /**
   * Collect all keys from iterator options.
   * @template T
   * @param {ValuesOptions<T>} [options] - Iterator options.
   * @returns {Promise<Array>} - Returns Array.
   */

  async values(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: false,
      values: true
    });

    return iter.values(options.parse);
  }

  /*
   * Async iterators
   */

  /**
   * Get generator for all the keys from iterator options.
   * @param {Object} options - Iterator Options.
   * @returns {AsyncIterator}
   */

  entriesAsync(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: true
    });

    return iter.entriesAsync();
  }

  /**
   * Get generator for all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {AsyncIterator}
   */

  keysAsync(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: false
    });

    return iter.keysAsync();
  }

  /**
   * Get generator for all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {AsyncIterator}
   */

  valuesAsync(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: false,
      values: true
    });

    return iter.valuesAsync();
  }

  /**
   * Dump database (for debugging).
   * @returns {Promise} - Returns Object.
   */

  async dump() {
    const records = Object.create(null);
    const items = await this.range();

    for (const item of items) {
      const key = item.key.toString('hex');
      const value = item.value.toString('hex');

      records[key] = value;
    }

    return records;
  }

  /**
   * Write and assert a version number for the database.
   * @param {Buffer} key
   * @param {String} name
   * @param {Number} version
   * @returns {Promise}
   */

  async verify(key, name, version) {
    assert(typeof name === 'string');
    assert((version >>> 0) === version);

    const data = await this.get(key);

    if (!data) {
      const value = Buffer.alloc(name.length + 4);

      value.write(name, 0, 'ascii');
      value.writeUInt32LE(version, name.length);

      const batch = this.batch();

      batch.put(key, value);

      await batch.write();

      return;
    }

    if (data.length !== name.length + 4)
      throw new Error(versionError(name));

    if (data.toString('ascii', 0, name.length) !== name)
      throw new Error(versionError(name));

    const num = data.readUInt32LE(name.length);

    if (num !== version)
      throw new Error(versionError(name));
  }

  /**
   * Clone the database.
   * @param {String} path
   * @returns {Promise}
   */

  async clone(path) {
    if (!this.loaded)
      throw new Error('Database is closed.');

    const options = new DBOptions(this.options);

    options.createIfMissing = true;
    options.errorIfExists = true;

    const tmp = new DB(this.backend, path, options);

    await tmp.open();

    try {
      await this.cloneTo(tmp);
    } finally {
      await tmp.close();
    }
  }

  /**
   * Clone the database.
   * @param {Object} db
   * @returns {Promise}
   */

  async cloneTo(db) {
    const hwm = 256 << 20;

    const iter = this.iterator({
      keys: true,
      values: true
    });

    let batch = db.batch();
    let total = 0;

    await iter.each(async (key, value) => {
      batch.put(key, value);

      total += key.length + 80;
      total += value.length + 80;

      if (total >= hwm) {
        await batch.write();

        batch = db.batch();
        total = 0;
      }
    });

    return batch.write();
  }
}

/**
 * Batch
 */

class Batch {
  /**
   * Create a batch.
   * @constructor
   * @ignore
   * @param {Object} binding
   * @param {Buffer} [prefix=null]
   */

  constructor(binding, prefix) {
    this.binding = binding;
    this.prefix = prefix || null;
  }

  /**
   * Get bucket.
   * @param {Buffer} prefix
   * @returns {Batch}
   */

  bucket(prefix) {
    return new Batch(this.binding, prefix);
  }

  /**
   * Get root batch.
   * @returns {Batch}
   */

  root() {
    return this.bucket(null);
  }

  /**
   * Get child batch.
   * @param {Buffer} prefix
   * @returns {Batch}
   */

  child(prefix) {
    return this.bucket(concat(this.prefix, prefix));
  }

  /**
   * Wrap a batch or iterator.
   * @param {Object} obj
   * @returns {Object}
   */

  wrap(obj) {
    return obj.bucket(this.prefix);
  }

  /**
   * Write a value to the batch.
   * @param {Buffer} key
   * @param {Buffer} value
   */

  put(key, value) {
    if (value == null)
      value = LOW;

    assert(Buffer.isBuffer(value), 'Value must be a buffer.');

    this.binding.put(concat(this.prefix, key), value);

    return this;
  }

  /**
   * Delete a value from the batch.
   * @param {Buffer} key
   */

  del(key) {
    this.binding.del(concat(this.prefix, key));
    return this;
  }

  /**
   * Write batch to database.
   * @returns {Promise}
   */

  write() {
    return new Promise((resolve, reject) => {
      this.binding.write(wrap(resolve, reject));
    });
  }

  /**
   * Clear the batch.
   */

  clear() {
    this.binding.clear();
    return this;
  }
}

/**
 * Bucket
 */

class Bucket {
  /**
   * Create a bucket.
   * @constructor
   * @ignore
   * @param {DB} db
   * @param {Buffer} prefix
   */

  constructor(db, prefix) {
    assert(prefix == null || Buffer.isBuffer(prefix),
      'Prefix must be a buffer.');

    this.db = db;
    this.prefix = prefix || null;
  }

  /**
   * Get bucket.
   * @param {Buffer} prefix
   * @returns {Bucket}
   */

  bucket(prefix) {
    return new Bucket(this.db, prefix);
  }

  /**
   * Get root bucket.
   * @returns {Bucket}
   */

  root() {
    return this.bucket(null);
  }

  /**
   * Get child bucket.
   * @param {Buffer} prefix
   * @returns {Bucket}
   */

  child(prefix) {
    return this.bucket(concat(this.prefix, prefix));
  }

  /**
   * Wrap a batch or iterator.
   * @param {Object} obj
   * @returns {Object}
   */

  wrap(obj) {
    return obj.bucket(this.prefix);
  }

  /**
   * Create a batch.
   * @returns {Batch}
   */

  batch() {
    return new Batch(this.db.binding.batch(), this.prefix);
  }

  /**
   * Get a value from the bucket.
   * @param {Buffer} key
   * @returns {Promise}
   */

  has(key) {
    return this.db.has(concat(this.prefix, key));
  }

  /**
   * Get a value from the bucket.
   * @param {Buffer} key
   * @returns {Promise}
   */

  get(key) {
    return this.db.get(concat(this.prefix, key));
  }

  /**
   * Create an iterator.
   * @param {Object} options
   * @returns {Iterator}
   */

  iterator(options) {
    return new Iterator(this.db, options, this.prefix);
  }

  /**
   * Collect all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {Promise} - Returns Array.
   */

  async range(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: true
    });

    return iter.range(options.parse);
  }

  /**
   * Collect all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {Promise} - Returns Array.
   */

  async keys(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: false
    });

    return iter.keys(options.parse);
  }

  /**
   * Collect all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {Promise} - Returns Array.
   */

  async values(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: false,
      values: true
    });

    return iter.values(options.parse);
  }

  /**
   * Get generator for all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {AsyncIterator}
   */

  entriesAsync(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: true
    });

    return iter.entriesAsync();
  }

  /**
   * Get generator for all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {AsyncIterator}
   */

  keysAsync(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: true,
      values: false
    });

    return iter.keysAsync();
  }

  /**
   * Get generator for all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {AsyncIterator}
   */

  valuesAsync(options) {
    if (options == null)
      options = {};

    const iter = this.iterator({
      gt: options.gt,
      lt: options.lt,
      gte: options.gte,
      lte: options.lte,
      limit: options.limit,
      reverse: options.reverse,
      keys: false,
      values: true
    });

    return iter.valuesAsync();
  }
}

/**
 * Iterator
 */

class Iterator {
  /**
   * Create an iterator.
   * @constructor
   * @param {DB} db
   * @param {IterOptions} [options=null]
   * @param {Buffer} [prefix=null]
   */

  constructor(db, options, prefix) {
    this.db = db;
    this.options = options || null;
    this.prefix = prefix || null;

    this.binding = null;
    this.cache = [];
    this.finished = false;

    this.key = null;
    this.value = null;
  }

  /**
   * Start the iterator.
   */

  start() {
    if (this.binding)
      return;

    const options = new IteratorOptions(this.options);

    if (this.prefix != null) {
      assert(Buffer.isBuffer(this.prefix));

      if (options.gte != null)
        options.gte = concat(this.prefix, options.gte);

      if (options.lte != null)
        options.lte = concat(this.prefix, options.lte);

      if (options.gt != null)
        options.gt = concat(this.prefix, options.gt);

      if (options.lt != null)
        options.lt = concat(this.prefix, options.lt);

      if (options.gt == null && options.gte == null)
        options.gt = this.prefix;

      if (options.lt == null && options.lte == null)
        options.lt = increment(this.prefix);
    }

    this.binding = this.db.binding.iterator(options);
  }

  /**
   * Get bucket.
   * @param {Buffer} prefix
   * @returns {Iterator}
   */

  bucket(prefix) {
    assert(!this.binding);
    return new Iterator(this.db, this.options, prefix);
  }

  /**
   * Get root iterator.
   * @returns {Iterator}
   */

  root() {
    return this.bucket(null);
  }

  /**
   * Get child iterator.
   * @param {Buffer} prefix
   * @returns {Iterator}
   */

  child(prefix) {
    return this.bucket(concat(this.prefix, prefix));
  }

  /**
   * Wrap a batch or iterator.
   * @param {Object} obj
   * @returns {Object}
   */

  wrap(obj) {
    return obj.bucket(this.prefix);
  }

  /**
   * Clean up iterator.
   * @private
   */

  cleanup() {
    this.cache = [];
    this.finished = true;
    this.key = null;
    this.value = null;
  }

  /**
   * For each.
   * @template T
   * @param {EachCallback<T>} cb
   * @returns {Promise}
   */

  async each(cb) {
    assert(typeof cb === 'function');

    while (!this.finished) {
      await this.read();

      while (this.cache.length > 0) {
        const key = slice(this.prefix, this.cache.pop());
        const value = this.cache.pop();

        let result = null;

        try {
          result = cb(key, value);

          if (result instanceof Promise)
            result = await result;
        } catch (e) {
          await this.end();
          throw e;
        }

        if (result === false)
          return this.end();
      }
    }

    return this.end();
  }

  /**
   * Seek to the next key.
   * @returns {Promise}
   */

  async next() {
    if (!this.finished) {
      if (this.cache.length === 0)
        await this.read();
    }

    if (this.cache.length > 0) {
      this.key = slice(this.prefix, this.cache.pop());
      this.value = this.cache.pop();
      return true;
    }

    assert(this.finished);
    this.cleanup();

    return false;
  }

  /**
   * Seek to the next key.
   * @private
   * @param {Function} callback
   */

  _read(callback) {
    // Fast case: native leveldown.
    if (this.db.leveldown) {
      this.binding.next(callback);
      return;
    }

    // Slow case: abstract leveldown.
    // Make ALD look like the native
    // leveldown interface.
    this.binding.next((err, key, value) => {
      if (err) {
        callback(err);
        return;
      }

      if (key === undefined && value === undefined) {
        callback(null, [], true);
        return;
      }

      callback(null, [value, key], false);
    });
  }

  /**
   * Seek to the next key (buffer values).
   * @private
   * @returns {Promise}
   */

  read() {
    return new Promise((resolve, reject) => {
      if (!this.binding) {
        try {
          this.start();
        } catch (e) {
          reject(e);
          return;
        }
      }

      this._read((err, cache, finished) => {
        if (err) {
          this.cleanup();
          this.binding.end(() => reject(err));
          return;
        }

        this.cache = cache;
        this.finished = finished;

        resolve();
      });
    });
  }

  /**
   * Seek to an arbitrary key.
   * @param {Buffer} key
   */

  seek(key) {
    assert(Buffer.isBuffer(key), 'Key must be a buffer.');

    this.start();
    this.binding.seek(key);

    return this;
  }

  /**
   * End the iterator.
   * @returns {Promise}
   */

  end() {
    return new Promise((resolve, reject) => {
      if (!this.binding) {
        try {
          this.start();
        } catch (e) {
          reject(e);
          return;
        }
      }

      this.cleanup();
      this.binding.end(wrap(resolve, reject));
    });
  }

  /**
   * Collect all keys and values from iterator options.
   * @template T
   * @param {EachCallback<T>} [parse]
   * @returns {Promise<IteratorItem[]|T[]>} - Returns Array.
   */

  async range(parse) {
    assert(!parse || typeof parse === 'function');

    if (!parse) {
      /** @type {IteratorItem[]} */
      const items = [];

      await this.each((key, value) => {
        items.push(new IteratorItem(key, value));
      });

      return items;
    }

    /** @type {T[]} */
    const items = [];

    await this.each((key, value) => {
      const item = parse(key, value);

      if (item != null)
        items.push(item);
    });

    return items;
  }

  /**
   * Collect all keys from iterator options.
   * @template T
   * @param {KeysCallback<T>} [parse]
   * @returns {Promise<T[]|Buffer[]>} - Returns Array.
   */

  async keys(parse) {
    assert(!parse || typeof parse === 'function');

    if (!parse) {
      /** @type {Buffer[]} */
      const items = [];

      await this.each((key, value) => {
        items.push(key);
      });

      return items;
    }

    /** @type {T[]} */
    const items = [];

    await this.each((key, value) => {
      /** @type {T|null} */
      const parsed = parse(key);

      if (parsed != null)
        items.push(parsed);
    });

    return items;
  }

  /**
   * Collect all values from iterator options.
   * @template T
   * @param {ValuesCallback<T>} [parse]
   * @returns {Promise<T[]|Buffer[]>} - Returns Array.
   */

  async values(parse) {
    assert(!parse || typeof parse === 'function');

    if (!parse) {
      /** @type {Buffer[]} */
      const items = [];

      await this.each((key, value) => {
        items.push(value);
      });

      return items;
    }

    /** @type {T[]} */
    const items = [];

    await this.each((key, value) => {
      /** @type {T|null} */
      const parsed = parse(value);

      if (parsed != null)
        items.push(parsed);
    });

    return items;
  }

  /**
   * Collect all keys from iterator.
   * @returns {AsyncIterator}
   */

  keysAsync() {
    return new AsyncIterator(this, iteratorTypes.ITER_TYPE_KEYS);
  }

  /**
   * Collect all values from iterator.
   * @returns {AsyncIterator}
   */

  valuesAsync() {
    return new AsyncIterator(this, iteratorTypes.ITER_TYPE_VALUES);
  }

  /**
   * Collect all
   * @returns {AsyncIterator}
   */

  entriesAsync() {
    return new AsyncIterator(this, iteratorTypes.ITER_TYPE_KEY_VAL);
  }

  /**
   * Default iterator collects all
   * @returns {AsyncIterator}
   */

  [asyncIterator]() {
    return this.entriesAsync();
  }
}

/**
 * Async iterator.
 */

class AsyncIterator {
  /** @type {Iterator} iter */
  iter;

  /** @type {iteratorTypes} type */
  type;

  /**
   * @param {Iterator} iter
   * @param {iteratorTypes} type
   */

  constructor(iter, type) {
    this.iter = iter;
    this.type = type;
    this.done = false;
  }

  get finished() {
    return this.iter.finished;
  }

  async next() {
    if (!await this.iter.next()) {
      if (!this.done) {
        await this.iter.end();
        this.done = true;
      }

      return { value: undefined, done: true };
    }

    const key = this.iter.key;
    const value = this.iter.value;

    switch (this.type) {
      case ITER_TYPE_KEYS:
        return { value: key, done: false };
      case ITER_TYPE_VALUES:
        return { value: value, done: false };
      case ITER_TYPE_KEY_VAL: {
        const item = new IteratorItem(key, value);
        return { value: item, done: false };
      }
      default:
        throw new Error('Bad value mode.');
    }
  }

  async return(value) {
    const result = {
      value: value ? value : undefined,
      done: true
    };

    if (!this.done) {
      await this.iter.end();
      this.done = true;
    }

    return result;
  }

  async throw(err) {
    try {
      if (!this.done) {
        await this.iter.end();
        this.done = true;
      }
    } catch (e) {
      ;
    }

    return Promise.reject(err);
  }

  [asyncIterator]() {
    return this;
  }
}

/**
 * Iterator Item
 */

class IteratorItem {
  /**
   * Create an iterator item.
   * @constructor
   * @param {Buffer} key
   * @param {Buffer} value
   * @property {Buffer} key
   * @property {Buffer} value
   */

  constructor(key, value) {
    this.key = key;
    this.value = value;
  }
}

/**
 * DBOptions
 */

class DBOptions {
  /**
   * Create DBOptions.
   * @constructor
   * @ignore
   * @param {Object} options
   */

  constructor(options) {
    this.createIfMissing = true;
    this.errorIfExists = false;
    this.compression = true;
    this.cacheSize = 8 << 20;
    this.writeBufferSize = 4 << 20;
    this.maxOpenFiles = 64;
    this.maxFileSize = 2 << 20;
    this.paranoidChecks = false;
    this.memory = false;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @private
   * @param {Object} options
   * @returns {DBOptions}
   */

  fromOptions(options) {
    assert(options, 'Options are required.');

    if (options.createIfMissing != null) {
      assert(typeof options.createIfMissing === 'boolean',
        '`createIfMissing` must be a boolean.');
      this.createIfMissing = options.createIfMissing;
    }

    if (options.errorIfExists != null) {
      assert(typeof options.errorIfExists === 'boolean',
        '`errorIfExists` must be a boolean.');
      this.errorIfExists = options.errorIfExists;
    }

    if (options.compression != null) {
      assert(typeof options.compression === 'boolean',
        '`compression` must be a boolean.');
      this.compression = options.compression;
    }

    if (options.cacheSize != null) {
      assert(typeof options.cacheSize === 'number',
        '`cacheSize` must be a number.');
      assert(options.cacheSize >= 0);
      this.cacheSize = Math.floor(options.cacheSize / 2);
      this.writeBufferSize = Math.floor(options.cacheSize / 4);
    }

    if (options.maxFiles != null) {
      assert(typeof options.maxFiles === 'number',
        '`maxFiles` must be a number.');
      assert(options.maxFiles >= 0);
      this.maxOpenFiles = options.maxFiles;
    }

    if (options.maxFileSize != null) {
      assert(typeof options.maxFileSize === 'number',
        '`maxFileSize` must be a number.');
      assert(options.maxFileSize >= 0);
      this.maxFileSize = options.maxFileSize;
    }

    if (options.paranoidChecks != null) {
      assert(typeof options.paranoidChecks === 'boolean',
        '`paranoidChecks` must be a boolean.');
      this.paranoidChecks = options.paranoidChecks;
    }

    if (options.memory != null) {
      assert(typeof options.memory === 'boolean',
        '`memory` must be a boolean.');
      this.memory = options.memory;
    }

    return this;
  }
}

/**
 * Iterator Options
 */

class IteratorOptions {
  /** @type {Buffer} */
  gte;

  /** @type {Buffer} */
  lte;

  /** @type {Buffer} */
  gt;

  /** @type {Buffer} */
  lt;

  /**
   * Create iterator options.
   * @constructor
   * @param {IterOptions} options
   */

  constructor(options) {
    this.gte = null;
    this.lte = null;
    this.gt = null;
    this.lt = null;
    this.keys = true;
    this.values = false;
    this.fillCache = false;
    this.keyAsBuffer = true;
    this.valueAsBuffer = true;
    this.reverse = false;
    this.highWaterMark = 16 * 1024;

    // Note: do not add this property.
    // this.limit = null;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @private
   * @param {Object} options
   * @returns {IteratorOptions}
   */

  fromOptions(options) {
    assert(options, 'Options are required.');

    if (options.gte != null) {
      assert(Buffer.isBuffer(options.gte), '`gte` must be a buffer.');
      this.gte = options.gte;
    }

    if (options.lte != null) {
      assert(Buffer.isBuffer(options.lte), '`lte` must be a buffer.');
      this.lte = options.lte;
    }

    if (options.gt != null) {
      assert(Buffer.isBuffer(options.gt), '`gt` must be a buffer.');
      this.gt = options.gt;
    }

    if (options.lt != null) {
      assert(Buffer.isBuffer(options.lt), '`lt` must be a buffer.');
      this.lt = options.lt;
    }

    if (options.keys != null) {
      assert(typeof options.keys === 'boolean');
      this.keys = options.keys;
    }

    if (options.values != null) {
      assert(typeof options.values === 'boolean');
      this.values = options.values;
    }

    if (options.fillCache != null) {
      assert(typeof options.fillCache === 'boolean');
      this.fillCache = options.fillCache;
    }

    if (options.reverse != null) {
      assert(typeof options.reverse === 'boolean');
      this.reverse = options.reverse;
    }

    if (options.limit != null) {
      assert(typeof options.limit === 'number');
      assert(options.limit >= 0);
      this.limit = options.limit;
    }

    if (!this.keys && !this.values)
      throw new Error('Keys and/or values must be chosen.');

    return this;
  }
}

/*
 * Helpers
 */

function isNotFound(err) {
  if (!err)
    return false;

  return err.notFound
    || err.type === 'NotFoundError'
    || /not\s*found/i.test(err.message);
}

function wrap(resolve, reject) {
  return function(err, result) {
    if (err) {
      reject(err);
      return;
    }
    resolve(result);
  };
}

/**
 * @param {Buffer|null} prefix
 * @param {Buffer|null} key
 * @returns {Buffer?}
 */

function slice(prefix, key) {
  if (key == null)
    return key;

  assert(Buffer.isBuffer(key), 'Key must be a buffer.');

  if (key.length === 0)
    return key;

  if (prefix == null)
    return key;

  assert(Buffer.isBuffer(prefix));
  assert(key.length >= prefix.length);

  return key.slice(prefix.length);
}

/**
 * @param {Buffer} prefix
 * @param {Buffer} key
 * @returns {Buffer}
 */

function concat(prefix, key) {
  assert(Buffer.isBuffer(key), 'Key must be a buffer.');

  if (prefix == null)
    return key;

  assert(Buffer.isBuffer(prefix));

  const data = Buffer.allocUnsafe(prefix.length + key.length);

  prefix.copy(data, 0);
  key.copy(data, prefix.length);

  return data;
}

function increment(key) {
  if (key.length === 0)
    return null;

  const out = Buffer.from(key);

  let i = out.length - 1;

  for (; i >= 0; i--) {
    out[i] += 1;

    if (out[i] !== 0x00)
      break;
  }

  if (i === -1)
    return null;

  return out;
}

function versionError(name) {
  return `Database version mismatch for database: "${name}".`
    + ' Please run a data migration before opening.';
}

/*
 * Expose
 */

module.exports = DB;
