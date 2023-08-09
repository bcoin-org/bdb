'use strict';

const assert = require('bsert');
const bdb = require('../');
const {randomDBPath, rimrafSync} = require('./util/common');

const KEY = bdb.key('k', ['uint8']);
const VALUE = Buffer.from('foo', 'utf8');
const val = i => Buffer.from(`value-${i}`, 'utf8');

const DATABASE_CLOSED_ERR = {
  message: 'Database is closed.'
};

const ITERATOR_HAS_ENDED_ERR = {
  message: 'Iterator has ended.'
};

describe('Database close guards', function() {
  let dbpath, db;

  beforeEach(async () => {
    dbpath = randomDBPath('close-guards');
    db = bdb.create(dbpath);

    await db.open();
    await db.close();
  });

  afterEach(async () => {
    if (db.loaded)
      await db.close();

    rimrafSync(dbpath);
  });

  it('should throw an error if db is open and we call open', async () => {
    await db.open();
    await assert.rejects(db.open(), {
      message: 'Database is already open.'
    });
  });

  it('should throw an error if db is open and we call open (low)', async () => {
    await db.open();

    await assert.rejects(wrapLowCall(db, 'open', {}), {
      message: 'Database is already open.'
    });
  });

  // defaults:
  //   sync: false, lowOnly: false, err: DATABASE_CLOSED_ERR, args: []
  const testCases = [
    { method: 'close', err: { message: 'Database is already closed.' } },
    { method: 'iterator', sync: true },
    { method: 'batch', sync: true },
    { method: 'put', args: [KEY.encode(0), VALUE] },
    { method: 'get', args: [KEY.encode(0)] },
    { method: 'del', args: [KEY.encode(0)] },
    { method: 'approximateSize', args: [KEY.encode(0), KEY.encode(1)] },
    { method: 'compactRange', args: [KEY.encode(0), KEY.encode(1)] },
    { method: 'getProperty', args: ['leveldb.stats'], sync: true },
    { method: 'batch', lowOnly: true, args: [[
      { type: 'put', key: KEY.encode(0), value: VALUE },
      { type: 'put', key: KEY.encode(1), value: VALUE },
      { type: 'del', key: KEY.encode(0) }
    ]]}
  ];

  const runTests = () => {
    for (const testInfo of testCases) {
      const method = testInfo.method;
      const args = testInfo.args || [];
      const expectedError = testInfo.err || DATABASE_CLOSED_ERR;

      if (!testInfo.lowOnly) {
        it(`should throw an error if db is closed and we call ${method}`, async () => {
          if (testInfo.sync) {
            assert.throws(() => {
              db[method](...args);
            }, expectedError);

            return;
          }

          await assert.rejects(db[method](...args), expectedError);
        });
      }

      it(`should throw an error if db is closed and we call ${method} (low)`, async () => {
        if (testInfo.sync) {
          assert.throws(() => {
            db.binding[method](...args);
          }, expectedError);

          return;
        }

        await assert.rejects(wrapLowCall(db, method, ...args), expectedError);
      });
    }
  };

  describe('Closed', function() {
    runTests();
  });

  describe('Closing', function() {
    beforeEach(async () => {
      await db.open();
      db.close();
    });

    runTests();
  });

  describe('Batch', function() {
    let batch;

    beforeEach(async () => {
      await db.open();
      batch = db.batch();
    });

    it('should throw an error if db is closed and we call batch.put', async () => {
      await db.close();
      const error = { message: 'Database is closed.' };

      assert.throws(() => {
        batch.put(KEY.encode(1), val(1));
      }, error);

      assert.throws(() => {
        batch.del(KEY.encode(1));
      }, error);

      assert.throws(() => {
        batch.clear();
      }, error);
    });

    it('should throw an error if db is closed and we call batch.write (empty)', async () => {
      await db.close();

      await assert.rejects(batch.write(), DATABASE_CLOSED_ERR);
    });

    it('should throw an error if db is closed and we call batch.write', async () => {
      batch.put(KEY.encode(0), val(0));
      await db.close();

      await assert.rejects(batch.write(), DATABASE_CLOSED_ERR);
    });

    it('should throw an error if db is closed and we call batch.del', async () => {
      batch.put(KEY.encode(2), val(2));
      await db.close();

      assert.throws(() => {
        batch.del(KEY.encode(2), val(2));
      }, DATABASE_CLOSED_ERR);
    });

    it('should throw an error if db is closed and we call batch.clear', async () => {
      batch.put(KEY.encode(2), val(2));
      await db.close();

      assert.throws(() => {
        batch.clear();
      }, DATABASE_CLOSED_ERR);
    });

    it('should throw an error if db is closing and we call batch.write (empty)', async () => {
      db.close();
      await assert.rejects(batch.write(), DATABASE_CLOSED_ERR);
    });

    it('should throw an error if db is closing and we call batch.write', async () => {
      batch.put(KEY.encode(0), val(0));
      db.close();

      await assert.rejects(batch.write(), DATABASE_CLOSED_ERR);
    });

    it('should throw an error if db is closing and we call batch.del', async () => {
      batch.put(KEY.encode(2), val(2));
      db.close();

      assert.throws(() => {
        batch.del(KEY.encode(2), val(2));
      }, DATABASE_CLOSED_ERR);
    });

    it('should throw an error if db is closing and we call batch.clear', async () => {
      batch.put(KEY.encode(2), val(2));
      db.close();

      assert.throws(() => {
        batch.clear();
      }, DATABASE_CLOSED_ERR);
    });
  });

  describe('Iterators', function() {
    let iter;

    const val = i => Buffer.from(`value-${i}`, 'utf8');

    beforeEach(async () => {
      await db.open();
      const b = db.batch();
      b.put(KEY.encode(0), val(0));
      b.put(KEY.encode(1), val(1));
      b.put(KEY.encode(2), val(2));
      b.put(KEY.encode(3), val(3));
      b.put(KEY.encode(4), val(4));
      await b.write();

      // make sure we have not 'start'ed it.
      iter = db.iterator({
        gte: KEY.min(),
        lte: KEY.max(),
        keys: true,
        values: true
      });
    });

    it('should throw an error if db is closed and we call iterator.start', async () => {
      await db.close();

      assert.throws(() => {
        iter.start();
      }, DATABASE_CLOSED_ERR);
    });

    it('should not throw an error if db is closed and we call iterator.start again', async () => {
      iter.start();
      await db.close();

      assert.doesNotThrow(() => {
        iter.start();
      });
    });

    it('should throw an error if db is closed and we are nexting', async () => {
      iter.start();
      await db.close();

      await assert.rejects(iter.next(), ITERATOR_HAS_ENDED_ERR);
    });

    it('should throw an error if db is closed and we call .next', async () => {
      iter.start();
      await db.close();

      await assert.rejects(iter.read(), ITERATOR_HAS_ENDED_ERR);
    });

    it('should throw an error if db is closed and we call .seek', async () => {
      iter.start();

      await db.close();

      assert.throws(() => {
        iter.seek(KEY.encode(3));
      }, ITERATOR_HAS_ENDED_ERR);
    });

    it('should throw an error if db is closed and we call .end', async () => {
      iter.start();

      await db.close();

      await assert.rejects(iter.end(), ITERATOR_HAS_ENDED_ERR);
    });
  });

  describe('Segfault on close', function() {
    let dbpath, db;
    beforeEach(async () => {
      dbpath = randomDBPath('segfault');
      db = bdb.create(dbpath);
    });

    afterEach(async () => {
      if (db.loaded)
        await db.close();

      rimrafSync(dbpath);
    });

    // Based on https://github.com/Level/leveldown/blob/50dc50bf005c70b024fe4d3add369b236c8dcbb9/test/segfault-test.js
    const operations = {
      'get()': db => db.get(KEY.encode(0)),
      'put()': db => db.put(KEY.encode(0), VALUE),
      'del()': db => db.del(KEY.encode(0)),
      'batch()': (db) => {
        const b = db.batch();

        b.del(KEY.encode(0));

        return b.write();
      },
      'approximateSize()': db => db.approximateSize(KEY.min(), KEY.max()),
      'compactRange()': db => db.compactRange(KEY.min(), KEY.max())
    };

    const testPending = async (fn) => {
      dbpath = randomDBPath('segfault');
      const db = bdb.create(dbpath);

      await db.open();
      await db.put(KEY.encode(0), VALUE);

      await Promise.all([
        fn(db),
        db.close()
      ]);
    };

    for (const [name, fn] of Object.entries(operations)) {
      it(`should wait for pending ${name} before close`, async () => {
        await testPending(fn);
      });
    }

    it('should wait for pending operations before close', async () => {
      await testPending(async (db) => {
        const promises = [];

        for (const [, fn] of Object.entries(operations))
          promises.push(fn(db));

        return promises;
      });
    });
  });
});

async function wrapLowCall(obj, fn, ...args) {
  return new Promise((resolve, reject) => {
    obj.binding[fn].apply(obj.binding, args.concat(wrap(resolve, reject)));
  });
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
