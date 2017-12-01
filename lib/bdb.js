/**
 * bdb.js - database backend for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const LowLevelUp = require('./lowlevelup');
const backends = require('./backends');
const Key = require('./key');

class BDB extends LowLevelUp {
  /**
   * Create a database.
   * @alias module:db.BDB
   * @param {Object} options
   * @returns {LowLevelUp}
   */

  constructor(options = {}) {
    const {backend, location} = getBackend(options);
    super(backend, location, options);
  }
}

BDB.create = options => new BDB(options);
BDB.BDB = BDB;
BDB.LowLevelUp = LowLevelUp;
BDB.Key = Key;

/**
 * Get database name and extension based on options.
 * @param {String} db
 * @returns {Object}
 */

function getName(db) {
  let name, ext;

  if (db == null)
    db = 'memory';

  assert(typeof db === 'string');

  switch (db) {
    case 'ldb':
    case 'leveldb':
    case 'leveldown':
    case 'levelup':
      name = 'leveldown';
      ext = 'ldb';
      break;
    case 'mem':
    case 'memory':
      name = 'memory';
      ext = 'mem';
      break;
    default:
      name = db;
      ext = 'db';
      break;
  }

  return [name, ext];
}

/**
 * Get target backend and location.
 * @param {Object} options
 * @returns {Object}
 */

function getBackend(options) {
  let {db, location} = options;

  if (typeof db === 'function') {
    const backend = db;

    if (!location)
      throw new Error('Database requires a location.');

    assert(typeof location === 'string');

    return { backend, location };
  }

  const [name, ext] = getName(db);
  const backend = backends.get(name);

  if (name === 'memory') {
    if (!location)
      location = 'memory';

    assert(typeof location === 'string');

    location = `${location}.${ext}`;

    return { backend, location };
  }

  if (!location)
    throw new Error('Database requires a location.');

  assert(typeof location === 'string');

  location = `${location}.${ext}`;

  return { backend, location };
}

/*
 * Expose
 */

module.exports = BDB;
