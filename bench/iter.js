/*!
 * bench/iter.js - benchmark iterators.
 *
 * This can be run to test the performance of the iterators.
 * We can compare old style iterators to the async iterators (generators)
 * and see the performance hit/boost with the updated version.
 *
 * Usage:
 * node ./iter.js [--iterator=<type>] [--cacheSize=<bytes>] [--location=<path>]
 *
 * Options:
 * - `iterator`  This can be "each" or "async".
 * - `cacheSize` The total number of items returned in a single next().
 * - `location`  The location to store the db.
 *
 * Test cases:
 *   - range/entriesAsync
 *   - keys/keysAsync
 *   - values/valuesAsync
 *   - each/entriesAsync - delete items.
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const randomBytes = crypto.randomBytes.bind(crypto);
const os = require('os');
const bdb = require('..');

// Key -> RANDOM_INT key
const RANDOM_INT_REF = bdb.key('v', ['hash256']);

// Key -> RANDOM_INT
const RANDOM_INTS = bdb.key('s', ['hash256']);

const num = (Math.random() * 0x100000000) >>> 0;
const dbpath = path.join(os.tmpdir(), `bdb-bench-${num}.db`);

const argConfig = {
  'iterator': {
    value: true,
    valid: t => t === 'async' || t === 'each',
    fallback: 'async'
  },
  'location': {
    value: true,
    valid: l => path.isAbsolute(l),
    fallback: dbpath
  },
  'cacheSize': {
    value: true,
    parse: parseInt,
    valid: a => Number.isSafeInteger(a) && a > 0,
    fallback: 1000
  },
  'items': {
    value: true,
    parse: parseInt,
    valid: a => Number.isSafeInteger(a) && a > 0,
    fallback: 100000
  }
};

(async () => {
  let settings;

  try {
    settings = processArgs(process.argv, argConfig);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const db = bdb.create(settings.location);

  await db.open();

  let batch;
  let items = 0;

  // Clean up entries
  const iter = db.iterator({
    gte: RANDOM_INTS.min(),
    lte: RANDOM_INTS.max()
  });

  batch = db.batch();

  console.log('Settings: ', settings);

  console.log('Cleaning up database...');
  await iter.each(async (key) => {
    batch.del(key);
    items++;
  });

  await batch.write();
  console.log('Cleaned up %d items.', items);

  console.log('Creating %d random entries...', settings.items);

  batch = db.batch();

  const randNumber = Buffer.alloc(4);
  for (let i = 0; i < settings.items; i++) {
    const intKey = RANDOM_INTS.encode(randomBytes(32));
    randNumber.writeUInt32LE(i);
    const refKey = RANDOM_INT_REF.encode(randomBytes(32));

    batch.put(intKey, randNumber);
    batch.put(refKey, intKey);
  }

  await batch.write();
  console.log('Created %d random entries.', settings.items);

  let benchIter;

  if (settings.iterator === 'async') {
    benchIter = new BenchIterAsync(db);
  } else {
    benchIter = new BenchIterEach(db);
  }

  console.log('Sum of all numbers: %d',
    await benchIter.findAllNumbersAndSum());

  console.log('Sum of all numbers values: %d',
    await benchIter.rangeSum());

  console.log('All keys starting with M in ref: ');
  const keys = await benchIter.keysStartingWithM();
  console.log(keys.slice(0, 5), '...');

  await benchIter.deleteAllItems();

  await db.close();
})().catch((err) => {
  console.error(err);
  process.exit(2);
});

class BenchIter {
  constructor(db) {
    this.db = db;
    this.startTime = null;
    this.endTime = null;
    this.iterations = 0;
    this.startMemory = null;
    this.endMemory = null;
  }

  start() {
    this.startTime = process.hrtime.bigint();
    this.iterations = 0;
  }

  end() {
    this.endTime = process.hrtime.bigint();

    const ms = Number(this.endTime - this.startTime) / 1000000;
    const rate = this.iterations / ms;
    console.log('> Iterated %d items in %d ms.', this.iterations, ms);
    console.log('> Rate: %d items/ms.', rate);
    console.log('> Memory:',
      formatMemory(memoryUsage(memoryUsage())));
  }

  async deleteAllItems() {
    throw new Error('Not implemented.');
  }
}

class BenchIterEach extends BenchIter {
  async deleteAllItems() {
    const batch = this.db.batch();
    const iter = this.db.iterator({
      gte: RANDOM_INT_REF.min(),
      lte: RANDOM_INT_REF.max(),
      values: true
    });

    this.start();
    await iter.each(async (key, value) => {
      batch.del(key);
      batch.del(value);
      this.iterations++;
    });

    this.end();

    await batch.write();
  }

  async findAllNumbersAndSum() {
    let sum = 0;

    const iter = this.db.iterator({
      gte: RANDOM_INT_REF.min(),
      lte: RANDOM_INT_REF.max(),
      values: true
    });

    this.start();

    await iter.each(async (key, value) => {
      const number = await this.db.get(value);
      sum += number.readUInt32LE();
      this.iterations++;
    });

    this.end();
    return sum;
  }

  async rangeSum() {
    let sum = 0;

    const iter = this.db.iterator({
      gte: RANDOM_INTS.min(),
      lte: RANDOM_INTS.max(),
      values: true
    });

    this.start();

    const values = await iter.values(val => val.readUInt32LE());

    for (const num of values) {
      this.iterations++;
      sum += num;
    }

    this.end();
    return sum;
  }

  // This can be done effectively with proper lte/gte,
  // but we are checking something else.
  async keysStartingWithM() {
    const iter = this.db.iterator({
      gte: RANDOM_INT_REF.min(),
      lte: RANDOM_INT_REF.max(),
      values: false
    });

    this.start();

    const items = [];
    await iter.keys((key) => {
      const dec = RANDOM_INT_REF.decode(key)[0];

      if (dec[0] === 77)
        items.push(dec);
      this.iterations++;
    });

    this.end();
    return items;
  }
}

class BenchIterAsync extends BenchIter {
  async deleteAllItems() {
    const batch = this.db.batch();
    const iter = this.db.iterator({
      gte: RANDOM_INT_REF.min(),
      lte: RANDOM_INT_REF.max(),
      values: true
    });

    this.start();

    for await (const {key, value} of iter) {
      batch.del(key);
      batch.del(value);
      this.iterations++;
    }

    this.end();

    await batch.write();
  }

  async findAllNumbersAndSum() {
    let sum = 0;

    const iter = this.db.iterator({
      gte: RANDOM_INT_REF.min(),
      lte: RANDOM_INT_REF.max(),
      values: true
    });

    this.start();

    for await (const {value} of iter) {
      const number = await this.db.get(value);
      sum += number.readUInt32LE();
      this.iterations++;
    }

    this.end();
    return sum;
  }

  async rangeSum() {
    let sum = 0;

    const iter = this.db.iterator({
      gte: RANDOM_INTS.min(),
      lte: RANDOM_INTS.max(),
      values: true
    });

    this.start();

    for await (const val of iter.valuesAsync()) {
      this.iterations++;
      sum += val.readUInt32LE();
    }

    this.end();
    return sum;
  }

  async keysStartingWithM() {
    const iter = this.db.iterator({
      gte: RANDOM_INT_REF.min(),
      lte: RANDOM_INT_REF.max(),
      values: false
    });

    this.start();

    const items = [];
    for await (const key of iter.keysAsync()) {
      const dec = RANDOM_INT_REF.decode(key)[0];

      if (dec[0] === 77)
        items.push(dec);
      this.iterations++;
    }

    this.end();
    return items;
  }
}

// From bcoin/bench/blockstore.js
function processArgs(argv, config) {
  const args = {};

  for (const key in config)
    args[key] = config[key].fallback;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const match = arg.match(/^(\-){1,2}([a-z]+)(\=)?(.*)?$/);

    if (!match) {
      throw new Error(`Unexpected argument: ${arg}.`);
    } else {
      const key = match[2];
      let value = match[4];

      if (!config[key])
        throw new Error(`Invalid argument: ${arg}.`);

      if (config[key].value && !value) {
        value = process.argv[i + 1];
        i++;
      } else if (!config[key].value && !value) {
        value = true;
      } else if (!config[key].value && value) {
        throw new Error(`Unexpected value: ${key}=${value}`);
      }

      if (config[key].parse)
        value = config[key].parse(value);

      if (value)
        args[key] = value;

      if (!config[key].valid(args[key]))
        throw new Error(`Invalid value: ${key}=${value}`);
    }
  }

  return args;
}

function memoryUsage() {
  const mem = process.memoryUsage();

  return {
    total: mem.rss,
    jsHeap: mem.heapUsed,
    jsHeapTotal: mem.heapTotal,
    nativeHeap: mem.rss - mem.heapTotal,
    external: mem.external
  };
}

function mb(num) {
  return Math.floor(num / (1 << 20));
}

function formatMemory(raw) {
  return {
    total: mb(raw.total) + 'mb',
    jsHeap: mb(raw.jsHeap) + 'mb',
    jsHeapTotal: mb(raw.jsHeapTotal) + 'mb',
    nativeHeap: mb(raw.nativeHeap) + 'mb',
    external: mb(raw.external) + 'mb'
  };
}
