'use strict';

const common = exports;
const {join} = require('path');
const os = require('os');
const fs = require('fs');

common.randomDBPath = (name = 'test') => {
  const num = (Math.random() * 0x100000000) >>> 0;
  const dbpath = join(os.tmpdir(), `bdb-${name}-${num}.db`);

  return dbpath;
};

// Sync version of the bfile rimraf:
// https://github.com/bcoin-org/bfile/blob/c3075133a02830dc384f8353d8275d4499b8bff9/lib/extra.js#L466
common.rimrafSync = (path, depth = 0) => {
  let ret = 0;
  let stat = null;

  try {
    stat = fs.statSync(path);
  } catch (e) {
    if (e.code === 'ENOENT')
      return ret;

    throw e;
  }

  if (stat.isDirectory()) {
    let list = null;

    try {
      list = fs.readdirSync(path);
    } catch (e) {
      if (e.code === 'ENOENT')
        return ret;
      throw e;
    }

    for (const name of list)
      ret += common.rimrafSync(join(path, name), depth + 1);

    if (ret === 0) {
      try {
        fs.rmdirSync(path);
      } catch (e) {
        if (e.code === 'ENOENT')
          return ret;
        throw e;
      }
    }

    return ret;
  }

  try {
    fs.unlinkSync(path);
  } catch (e) {
    if (e.code === 'ENOENT')
      return ret;
    throw e;
  }

  return ret;
};
