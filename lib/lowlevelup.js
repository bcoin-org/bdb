/*!
 * lowlevelup.js - LevelUP module for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');

/**
 * Constants
 */

const LOW = Buffer.from([0x00]);
const HIGH = Buffer.from([0xff]);
const DUMMY = Buffer.alloc(0);

let VERSION_ERROR = null;

/**
 * LowLevelUp
 */

class LowLevelUp {
  /**
   * Create an LLU instance.
   * @constructor
   * @param {Function} backend - Database backend.
   * @param {String} location - File location.
   * @param {Object?} options - Leveldown options.
   */

  constructor(backend, location, options) {
    assert(typeof backend === 'function', 'Backend is required.');
    assert(typeof location === 'string', 'Filename is required.');

    this.options = new LLUOptions(options);
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

    let db = new Backend(this.location);

    // Stay as close to the metal as possible.
    // We want to make calls to C++ directly.
    while (db.db) {
      // Not a database.
      if (typeof db.db.put !== 'function')
        break;

      // Recursive.
      if (db.db === db)
        break;

      // Go deeper.
      db = db.db;
    }

    // A lower-level binding.
    if (db.binding) {
      this.binding = db.binding;
      this.leveldown = db !== db.binding;
    } else {
      this.binding = db;
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
    if (!this.binding.backup)
      return this.clone(path);

    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }
      this.binding.backup(path, wrap(resolve, reject));
    });
  }

  /**
   * Retrieve a record from the database.
   * @param {String|Buffer} key
   * @returns {Promise} - Returns Buffer.
   */

  get(key) {
    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
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
   * @param {String|Buffer} key
   * @param {Buffer} value
   * @returns {Promise}
   */

  put(key, value) {
    if (!value)
      value = LOW;

    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }
      this.binding.put(key, value, wrap(resolve, reject));
    });
  }

  /**
   * Remove a record from the database.
   * @param {String|Buffer} key
   * @returns {Promise}
   */

  del(key) {
    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
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

    return new Batch(this);
  }

  /**
   * Create a bucket.
   * @param {Buffer} [prefix=DUMMY]
   * @returns {Bucket}
   */

  bucket(prefix) {
    if (!this.loaded)
      throw new Error('Database is closed.');

    return new Bucket(this, this.batch(), prefix);
  }

  /**
   * Create an iterator.
   * @param {Object} options
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
   * @param {String|Buffer} start - Start key.
   * @param {String|Buffer} end - End key.
   * @returns {Promise} - Returns Number.
   */

  approximateSize(start, end) {
    return new Promise((resolve, reject) => {
      if (!this.loaded) {
        reject(new Error('Database is closed.'));
        return;
      }

      if (!this.binding.approximateSize) {
        reject(new Error('Cannot get size.'));
        return;
      }

      this.binding.approximateSize(start, end, wrap(resolve, reject));
    });
  }

  /**
   * Compact range of keys.
   * @param {String|Buffer|null} start - Start key.
   * @param {String|Buffer|null} end - End key.
   * @returns {Promise}
   */

  compactRange(start, end) {
    if (!start)
      start = LOW;

    if (!end)
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

      this.binding.compactRange(start, end, wrap(resolve, reject));
    });
  }

  /**
   * Test whether a key exists.
   * @param {String} key
   * @returns {Promise} - Returns Boolean.
   */

  async has(key) {
    const value = await this.get(key);
    return value != null;
  }

  /**
   * Collect all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {Promise} - Returns Array.
   */

  range(options = {}) {
    const iter = this.iterator({
      gte: options.gte,
      lte: options.lte,
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

  keys(options = {}) {
    const iter = this.iterator({
      gte: options.gte,
      lte: options.lte,
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

  values(options = {}) {
    const iter = this.iterator({
      gte: options.gte,
      lte: options.lte,
      keys: false,
      values: true
    });
    return iter.values(options.parse);
  }

  /**
   * Dump database (for debugging).
   * @returns {Promise} - Returns Object.
   */

  async dump() {
    const records = Object.create(null);

    const items = await this.range({
      gte: LOW,
      lte: HIGH
    });

    for (const item of items) {
      const key = item.key.toString('hex');
      const value = item.value.toString('hex');
      records[key] = value;
    }

    return records;
  }

  /**
   * Write and assert a version number for the database.
   * @param {Number} version
   * @returns {Promise}
   */

  async checkVersion(key, version) {
    const data = await this.get(key);

    if (!data) {
      const value = Buffer.allocUnsafe(4);
      value.writeUInt32LE(version, 0, true);
      const batch = this.batch();
      batch.put(key, value);
      await batch.write();
      return;
    }

    const num = data.readUInt32LE(0, true);

    if (num !== version)
      throw new Error(VERSION_ERROR);
  }

  /**
   * Clone the database.
   * @param {String} path
   * @returns {Promise}
   */

  async clone(path) {
    if (!this.loaded)
      throw new Error('Database is closed.');

    const hwm = 256 << 20;

    const options = new LLUOptions(this.options);
    options.createIfMissing = true;
    options.errorIfExists = true;

    const tmp = new LowLevelUp(this.backend, path, options);

    await tmp.open();

    const iter = this.iterator({
      keys: true,
      values: true
    });

    let batch = tmp.batch();
    let total = 0;

    while (await iter.next()) {
      const {key, value} = iter;

      batch.put(key, value);

      total += key.length + 80;
      total += value.length + 80;

      if (total >= hwm) {
        total = 0;

        try {
          await batch.write();
        } catch (e) {
          await iter.end();
          await tmp.close();
          throw e;
        }

        batch = tmp.batch();
      }
    }

    try {
      await batch.write();
    } finally {
      await tmp.close();
    }
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
   * @param {LowLevelUp} db
   */

  constructor(db) {
    this.batch = db.binding.batch();
  }

  /**
   * Write a value to the batch.
   * @param {String|Buffer} key
   * @param {Buffer} value
   */

  put(key, value) {
    if (!value)
      value = LOW;

    this.batch.put(key, value);

    return this;
  }

  /**
   * Delete a value from the batch.
   * @param {String|Buffer} key
   */

  del(key) {
    this.batch.del(key);
    return this;
  }

  /**
   * Write batch to database.
   * @returns {Promise}
   */

  write() {
    return new Promise((resolve, reject) => {
      this.batch.write(wrap(resolve, reject));
    });
  }

  /**
   * Clear the batch.
   */

  clear() {
    this.batch.clear();
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
   * @param {LowLevelUp} db
   * @param {Batch} batch
   * @param {Buffer} [prefix=DUMMY]
   */

  constructor(db, batch, prefix, parent) {
    this.db = db;
    this.batch = batch;
    this.prefix = prefix || DUMMY;
    this.parent = parent || DUMMY;
  }

  /**
   * Get child bucket.
   * @param {Buffer} [prefix=DUMMY]
   */

  batch() {
    return new Bucket(this.db, this.batch, this.prefix, this.parent);
  }

  /**
   * Get child bucket.
   * @param {Buffer} [prefix=DUMMY]
   */

  bucket(prefix = DUMMY) {
    const parent = this.prefix;
    const child = concat(parent, prefix);
    return new Bucket(this.db, this.batch, child, parent);
  }

  /**
   * Get child bucket.
   * @param {Buffer} [prefix=DUMMY]
   */

  up() {
    return new Bucket(this.db, this.batch, this.parent);
  }

  /**
   * Get a value from the bucket.
   * @param {String|Buffer} key
   * @returns {Promise}
   */

  has(key) {
    return this.db.has(concat(this.prefix, key));
  }

  /**
   * Get a value from the bucket.
   * @param {String|Buffer} key
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

  range(options = {}) {
    const iter = this.iterator({
      gte: options.gte,
      lte: options.lte,
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

  keys(options = {}) {
    const iter = this.iterator({
      gte: options.gte,
      lte: options.lte,
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

  values(options = {}) {
    const iter = this.iterator({
      gte: options.gte,
      lte: options.lte,
      keys: false,
      values: true
    });
    return iter.values(options.parse);
  }

  /**
   * Write a value to the bucket.
   * @param {String|Buffer} key
   * @param {Buffer} value
   */

  put(key, value) {
    this.batch.put(concat(this.prefix, key), value);
    return this;
  }

  /**
   * Delete a value from the bucket.
   * @param {String|Buffer} key
   */

  del(key) {
    this.batch.del(concat(this.prefix, key));
    return this;
  }

  /**
   * Write batch to database.
   * @returns {Promise}
   */

  write() {
    return this.batch.write();
  }

  /**
   * Clear the batch.
   */

  clear() {
    this.batch.clear();
    return this;
  }
}

/**
 * Iterator
 */

class Iterator {
  /**
   * Create an iterator.
   * @constructor
   * @ignore
   * @param {LowLevelUp} db
   * @param {Object} options
   */

  constructor(db, options, prefix) {
    this.prefix = prefix || DUMMY;
    this.options = new IteratorOptions(options, prefix);
    this.options.keyAsBuffer = db.options.bufferKeys;

    this.iter = db.binding.iterator(this.options);
    this.leveldown = db.leveldown;

    this.cache = [];
    this.finished = false;

    this.key = null;
    this.value = null;
    this.valid = true;
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
    this.valid = false;
  }

  /**
   * For each.
   * @returns {Promise}
   */

  async each(cb) {
    assert(this.valid);

    const {keys, values} = this.options;

    while (!this.finished) {
      await this.read();

      while (this.cache.length > 0) {
        const key = slice(this.prefix, this.cache.pop());
        const value = this.cache.pop();

        let result = null;

        try {
          if (keys && values)
            result = cb(key, value);
          else if (keys)
            result = cb(key);
          else if (values)
            result = cb(value);
          else
            assert(false);

          if (result instanceof Promise)
            result = await result;
        } catch (e) {
          await this.end();
          throw e;
        }

        if (result === false) {
          await this.end();
          break;
        }
      }
    }
  }

  /**
   * Seek to the next key.
   * @returns {Promise}
   */

  async next() {
    assert(this.valid);

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
   * Seek to the next key (buffer values).
   * @private
   * @returns {Promise}
   */

  read() {
    return new Promise((resolve, reject) => {
      if (!this.leveldown) {
        this.iter.next((err, key, value) => {
          if (err) {
            this.cleanup();
            this.iter.end(() => reject(err));
            return;
          }

          if (key === undefined && value === undefined) {
            this.cleanup();
            this.iter.end(wrap(resolve, reject));
            return;
          }

          this.cache = [value, key];

          resolve();
        });
        return;
      }

      this.iter.next((err, cache, finished) => {
        if (err) {
          this.cleanup();
          this.iter.end(() => reject(err));
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
   * @param {String|Buffer} key
   */

  seek(key) {
    assert(this.valid);
    this.iter.seek(key);
    return this;
  }

  /**
   * End the iterator.
   * @returns {Promise}
   */

  end() {
    return new Promise((resolve, reject) => {
      this.cleanup();
      this.iter.end(wrap(resolve, reject));
    });
  }

  /**
   * Collect all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {Promise} - Returns Array.
   */

  async range(parse) {
    const items = [];

    await this.each((key, value) => {
      if (parse) {
        const item = parse(key, value);
        if (item)
          items.push(item);
      } else {
        items.push(new IteratorItem(key, value));
      }
    });

    return items;
  }

  /**
   * Collect all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {Promise} - Returns Array.
   */

  async keys(parse) {
    const items = [];

    await this.each((key) => {
      if (parse)
        key = parse(key);
      items.push(key);
    });

    return items;
  }

  /**
   * Collect all keys from iterator options.
   * @param {Object} options - Iterator options.
   * @returns {Promise} - Returns Array.
   */

  async values(parse) {
    const items = [];

    await this.each((value) => {
      if (parse)
        value = parse(value);
      items.push(value);
    });

    return items;
  }
}

/**
 * Iterator Item
 */

class IteratorItem {
  /**
   * Create an iterator item.
   * @constructor
   * @ignore
   * @param {String|Buffer} key
   * @param {String|Buffer} value
   * @property {String|Buffer} key
   * @property {String|Buffer} value
   */

  constructor(key, value) {
    this.key = key;
    this.value = value;
  }
}

/**
 * LLUOptions
 */

class LLUOptions {
  /**
   * Create LLU Options.
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
    this.sync = false;
    this.mapSize = 256 * (1024 << 20);
    this.writeMap = false;
    this.noSubdir = true;
    this.bufferKeys = true;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @private
   * @param {Object} options
   * @returns {LLUOptions}
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

    if (options.sync != null) {
      assert(typeof options.sync === 'boolean',
        '`sync` must be a boolean.');
      this.sync = options.sync;
    }

    if (options.mapSize != null) {
      assert(typeof options.mapSize === 'number',
        '`mapSize` must be a number.');
      assert(options.mapSize >= 0);
      this.mapSize = options.mapSize;
    }

    if (options.writeMap != null) {
      assert(typeof options.writeMap === 'boolean',
        '`writeMap` must be a boolean.');
      this.writeMap = options.writeMap;
    }

    if (options.noSubdir != null) {
      assert(typeof options.noSubdir === 'boolean',
        '`noSubdir` must be a boolean.');
      this.noSubdir = options.noSubdir;
    }

    if (options.bufferKeys != null) {
      assert(typeof options.bufferKeys === 'boolean',
        '`bufferKeys` must be a boolean.');
      this.bufferKeys = options.bufferKeys;
    }

    return this;
  }
}

/**
 * Iterator Options
 */

class IteratorOptions {
  /**
   * Create iterator options.
   * @constructor
   * @ignore
   * @param {Object} options
   */

  constructor(options, prefix) {
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

    this.fromOptions(options || {}, prefix || DUMMY);
  }

  /**
   * Inject properties from options.
   * @private
   * @param {Object} options
   * @returns {IteratorOptions}
   */

  fromOptions(options, prefix) {
    assert(options, 'Options are required.');

    if (options.gte != null) {
      assert(Buffer.isBuffer(options.gte) || typeof options.gte === 'string');
      this.gte = concat(prefix, options.gte);
    }

    if (options.lte != null) {
      assert(Buffer.isBuffer(options.lte) || typeof options.lte === 'string');
      this.lte = concat(prefix, options.lte);
    }

    if (options.gt != null) {
      assert(Buffer.isBuffer(options.gt) || typeof options.gt === 'string');
      this.gt = concat(prefix, options.gt);
    }

    if (options.lt != null) {
      assert(Buffer.isBuffer(options.lt) || typeof options.lt === 'string');
      this.lt = concat(prefix, options.lt);
    }

    if (prefix.length > 0) {
      if (!this.gt && !this.gte)
        this.gt = prefix;

      if (!this.lt && !this.lte) {
        const pre = Buffer.from(prefix);
        for (let i = pre.length - 1; i >= 0; i--) {
          if (pre[i] !== 0xff) {
            pre[i] += 1;
            break;
          }
          pre[i] = 0;
        }
        this.lt = pre;
      }
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

    if (options.keyAsBuffer != null) {
      assert(typeof options.keyAsBuffer === 'boolean');
      this.keyAsBuffer = options.keyAsBuffer;
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

function slice(prefix, key) {
  if (!key || key.length === 0)
    return key;

  if (prefix.length === 0)
    return key;

  if (typeof key === 'string') {
    if (Buffer.isBuffer(prefix))
      prefix = prefix.toString('ascii');
    assert(typeof prefix === 'string');
    assert(key.length > prefix.length);
    return key.slice(prefix.length);
  }

  assert(Buffer.isBuffer(key));
  assert(key.length > prefix.length);

  return key.slice(prefix.length);
}

function concat(prefix, key) {
  if (prefix.length === 0)
    return key;

  if (typeof key === 'string') {
    if (Buffer.isBuffer(prefix))
      prefix = prefix.toString('ascii');
    assert(typeof prefix === 'string');
    return prefix + key;
  }

  assert(Buffer.isBuffer(key));

  const data = Buffer.allocUnsafe(prefix.length + key.length);

  if (typeof prefix === 'string') {
    data.write(prefix, 0, 'ascii');
  } else {
    assert(Buffer.isBuffer(prefix));
    prefix.copy(data, 0);
  }

  key.copy(data, prefix.length);

  return data;
}

VERSION_ERROR = 'Warning:'
  + ' Your database does not match the current database version.'
  + ' This is likely because the database layout or serialization'
  + ' format has changed drastically. If you want to dump your'
  + ' data, downgrade to your previous version first. If you do'
  + ' not think you should be seeing this error, post an issue on'
  + ' the repo.';

/*
 * Expose
 */

module.exports = LowLevelUp;
