/**
 * bdb.js - database backend for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const {DB} = require('./db');
const {Key} = require('./key');
const {MemDB} = require('./memdb');
const {Level} = require('./level');

exports.DB = DB;
exports.Key = Key;

/**
 * Create a database.
 * @param {Object} [options={}]
 * @property {String} [options.location] - Database location.
 * @property {Boolean} [options.memory=false] - Use an in-memory database.
 * @property {Boolean} [options.createIfMissing=true] - Create database if it
 * does not exist.
 * @property {Boolean} [options.errorIfExists=false] - Error on open if
 * database exists.
 * @property {Boolean} [options.compression=true] - Enable snappy compression.
 * @property {Number} [options.cacheSize=8 << 20] - LRU cache and write buffer
 * size.
 * @property {Number} [options.maxFiles=64] - Maximum open files.
 * @property {Number} [options.maxFileSize=2 << 20] - Maximum file size.
 * @returns {DB}
 */

exports.create = (options) => {
  if (options == null)
    options = {};

  if (typeof options === 'string')
    options = { location: options };

  assert(options && typeof options === 'object');

  const {memory, location} = options;

  if (memory) {
    // @ts-ignore
    return new DB(MemDB, 'memory', options);
  }

  // @ts-ignore
  return new DB(Level, location, options);
};

/**
 * @param {Number|String} id
 * @param {String[]|null} [ops=[]]
 * @returns {Key}
 */

exports.key = (id, ops) => new Key(id, ops);
