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
    this.level.get(key.toString('hex'), options, callback);
    return this;
  }

  put(key, value, options, callback) {
    this.level.put(key.toString('hex'), value, options, callback);
    return this;
  }

  del(key, options, callback) {
    this.level.del(key.toString('hex'), options, callback);
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
    this.batch.put(key.toString('hex'), value);
    this.hasOps = true;
    return this;
  }

  del(key) {
    this.batch.del(key.toString('hex'));
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
      gt: options.gt ? options.gt.toString('hex') : null,
      gte: options.gte ? options.gte.toString('hex') : null,
      lt: options.lt ? options.lt.toString('hex') : null,
      lte: options.lte ? options.lte.toString('hex') : null,
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

      if (key)
        key = Buffer.from(key, 'hex');

      if (value && !Buffer.isBuffer(value) && value.buffer)
        value = Buffer.from(value.buffer);

      callback(err, key, value);
    });
    return this;
  }

  seek(key) {
    this.iter.seek(key.toString('hex'));
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

module.exports = DB;
