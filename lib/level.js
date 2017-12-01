'use strict';

const Level = require('level-js');

class DB {
  constructor(location) {
    this.level = new Level(location);
  }

  open(options, callback) {
    this.level.open(options, callback);
    return this;
  }

  close(callback) {
    this.level.close(callback);
    return this;
  }

  get(key, options, callback) {
    this.level.get(toHex(key), options, callback);
    return this;
  }

  put(key, value, options, callback) {
    this.level.put(toHex(key), value, options, callback);
    return this;
  }

  del(key, options, callback) {
    this.level.del(toHex(key), options, callback);
    return this;
  }

  batch() {
    return new Batch(this);
  }

  iterator(options) {
    return new Iterator(this, options);
  }

  static destroy(db, callback) {
    Level.destroy(db, callback);
  }
}

class Batch {
  constructor(db) {
    this.db = db;
    this.batch = db.level.batch();
    this.hasOps = false;
  }

  put(key, value) {
    this.batch.put(toHex(key), value);
    this.hasOps = true;
    return this;
  }

  del(key) {
    this.batch.del(toHex(key));
    this.hasOps = true;
    return this;
  }

  write(callback) {
    if (!this.hasOps) {
      callback();
      return this;
    }
    this.batch.write(callback);
    return this;
  }

  clear() {
    this.batch.clear();
    return this;
  }
}

class Iterator {
  constructor(db, options) {
    const opt = {
      gt: toHex(options.gt),
      gte: toHex(options.gte),
      lt: toHex(options.lt),
      lte: toHex(options.lte),
      limit: options.limit,
      reverse: options.reverse,
      keys: options.keys,
      values: options.values,
      keyAsBuffer: false,
      valueAsBuffer: true
    };

    this.db = db;
    this.iter = db.level.iterator(opt);
    this.ended = false;
  }

  next(callback) {
    this.iter.next((err, key, value) => {
      // Hack for level-js: it doesn't actually
      // end iterators -- it keeps streaming keys
      // and values.
      if (this.ended)
        return;

      if (err) {
        callback(err);
        return;
      }

      if (key === undefined && value === undefined) {
        callback(err, key, value);
        return;
      }

      if (value && !Buffer.isBuffer(value) && value.buffer)
        value = Buffer.from(value.buffer);

      callback(err, key, value);
    });
    return this;
  }

  seek(key) {
    this.iter.seek(toHex(key));
    return this;
  }

  end(callback) {
    if (this.ended) {
      callback(new Error('end() already called on iterator.'));
      return;
    }
    this.ended = true;
    this.iter.end(callback);
    return this;
  }
}

function toHex(key) {
  if (Buffer.isBuffer(key))
    return key.toString('hex');
  return key;
}

module.exports = DB;
