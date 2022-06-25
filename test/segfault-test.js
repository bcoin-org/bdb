'use strict';

const assert = require('bsert');
const bdb = require('../');
const {randomDBPath, rimrafSync} = require('./util/common');

const KEY = bdb.key('k', ['uint8']);
const VALUE = Buffer.from('foo', 'utf8');
const val = i => Buffer.from(`value-${i}`, 'utf8');

describe('Segfault', function() {
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

  it('should not segfault if db is closed and we call close', async () => {
    assert.rejects(async () => {
      await db.close();
    }, {
      message: 'Database is already closed.'
    });
  });

  it('should not segfault if db is closed and we create iterator', async () => {
    assert.throws(() => {
      db.iterator();
    }, {
      message: 'Database is closed.'
    });
  });

  it('should not segfault if db is closed and we create batch', async () => {
    assert.throws(() => {
      db.batch();
    }, {
      message: 'Database is closed.'
    });
  });

  it('should not segfault if db is closed and we try .put', async () => {
    assert.rejects(db.put(KEY.encode(0), val(0)), {
      message: 'Database is closed.'
    });
  });

  it('should not segfault if db is closed and we try .get', async () => {
    assert.rejects(db.get(KEY.encode(0)), {
      message: 'Database is closed.'
    });
  });

  it('should not segfault if db is closed and we try .del', async () => {
    assert.rejects(db.del(KEY.encode(0)), {
      message: 'Database is closed.'
    });
  });

  describe('Batch', function() {
    let dbpath, db, batch;

    beforeEach(async () => {
      dbpath = randomDBPath('segfault');
      db = bdb.create(dbpath);

      await db.open();
      batch = db.batch();
    });

    afterEach(async () => {
      if (db.loaded)
        await db.close();

      rimrafSync(dbpath);
    });

    // Does not segfault, but should throw an error.
    it.skip('should not segfault if db is closed and we call batch.write (empty)', async () => {
      const batch = db.batch();
      await db.close();

      await assert.rejects(batch.write(), {
        // TODO: Add proper exception.
      });
    });

    // TODO: Fix segfault.
    it.skip('should not segfault if db is closed and we call batch.write', async () => {
      batch.put(KEY.encode(0), val(0));
      await db.close();

      await assert.rejects(batch.write(), {
        // TODO: Add proper exception.
      });
    });

    // TODO: Add proper exception.
    it.skip('should not segfault if db is closed and we call batch.put', async () => {
      await db.close();

      assert.throws(() => {
        batch.put(KEY.encode(1), val(1));
      }, {
        // TODO: Add proper exception.
      });
    });

    // TODO: Add proper exception.
    it.skip('should not segfault if db is closed and we call batch.del', async () => {
      batch.put(KEY.encode(2), val(2));
      await db.close();

      assert.throws(() => {
        batch.del(KEY.encode(2), val(2));
      }, {
        // TODO: Add proper exception.
      });
    });

    // TODO: Add proper exception.
    it.skip('should not segfault if db is closed and we call batch.clear', async () => {
      batch.put(KEY.encode(2), val(2));
      await db.close();

      assert.throws(() => {
        batch.clear();
      }, {
        // TODO: Add proper exception.
      });
    });
  });

  describe('Iterators', function() {
    let dbpath, db, iter;

    const val = i => Buffer.from(`value-${i}`, 'utf8');

    beforeEach(async () => {
      dbpath = randomDBPath('segfault');
      db = bdb.create(dbpath);

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

    afterEach(async () => {
      if (db.loaded)
        await db.close();

      rimrafSync(dbpath);
    });

    // TODO: Fix segfault.
    it.skip('should not segfault if db is closed and we call iterator.start', async () => {
      await db.close();

      assert.throws(() => {
        iter.start();
      }, {
        // TODO: Add proper exception.
      });
    });

    it('should not segfault if db is closed and we call iterator.start again', async () => {
      iter.start();
      await db.close();

      assert.doesNotThrow(() => {
        iter.start();
      });
    });

    // TODO: Fix time out.
    it.skip('should not segfault if db is closed and we call .next', async () => {
      iter.start();

      await db.close();

      await assert.rejects(iter.next(), {
        // TODO: Add proper exception.
      });
    });

    // TODO: Fix segfault.
    it.skip('should not segfault if db is closed and we call .seek', async () => {
      iter.start();

      await db.close();

      await assert.rejects(iter.seek(KEY.encode(3)), {
        // TODO: Add proper exception.
      });
    });

    // TODO: Fix time out.
    it.skip('should not segfault if db is closed and we call .end', async () => {
      iter.start();

      await db.close();

      await assert.rejects(iter.end(), {
        // TODO: Add proper exception.
      });
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
