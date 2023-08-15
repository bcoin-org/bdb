/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const bdb = require('../');
const vectors = require('./data/vectors.json');
const os = require('os');
const path = require('path');

describe('BDB', function() {
  const num = (Math.random() * 0x100000000) >>> 0;
  const dbpath = path.join(os.tmpdir(), `bdb-test-${num}.db`);
  const tkey = bdb.key('t', ['hash160', 'uint32']);
  const prefix = bdb.key('r');

  let db = null;

  before(async () => {
    db = bdb.create(dbpath);
    await db.open();
    assert.equal(db.location, dbpath);
    assert.equal(db.loading, false);
    assert.equal(db.loaded, true);
  });

  after(async () => {
    await db.close();
    assert.equal(db.loaded, false);
  });

  it('put and get key and value', async () => {
    const batch = db.batch();
    const hash = Buffer.alloc(20, 0x11);

    batch.put(tkey.encode(hash, 12), Buffer.from('foo'));

    await batch.write();

    const value = await db.get(tkey.encode(hash, 12));
    assert.equal(value.toString('utf8'), 'foo');
  });

  it('put and get key and value into bucket', async () => {
    const bucket = db.bucket(prefix.encode());
    const batch = bucket.batch();
    const hash = Buffer.alloc(20, 0x11);

    batch.put(tkey.encode(hash, 9), Buffer.from('foo'));

    await batch.write();

    const value = await bucket.get(tkey.encode(hash, 9));
    assert.equal(value.toString('utf8'), 'foo');
  });

  it('iterate over keys and values in a bucket', async () => {
    const mkey = bdb.key('m', ['hash160', 'uint32']);

    const bucket = db.bucket(prefix.encode());

    const batch = bucket.batch();

    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      const key = mkey.encode(Buffer.from(vector.key[0], 'hex'), vector.key[1]);
      const value = Buffer.from(vector.value, 'hex');
      batch.put(key, value);
    }

    await batch.write();

    const iter = bucket.iterator({
      gte: mkey.min(),
      lte: mkey.max(),
      values: true
    });

    let total = 0;

    await iter.each((key, value) => {
      const [hash, index] = mkey.decode(key);
      assert.equal(hash.toString('hex'), vectors[total].key[0]);
      assert.equal(index, vectors[total].key[1]);
      assert.equal(value.toString('hex'), vectors[total].value);
      total++;
    });

    assert.equal(total, vectors.length);
  });

  it('iterate over keys and values in a bucket (async)', async () => {
    const mkey = bdb.key('m', ['hash160', 'uint32']);

    const bucket = db.bucket(prefix.encode());

    const batch = bucket.batch();

    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      const key = mkey.encode(Buffer.from(vector.key[0], 'hex'), vector.key[1]);
      const value = Buffer.from(vector.value, 'hex');
      batch.put(key, value);
    }

    await batch.write();

    const iter = bucket.iterator({
      gte: mkey.min(),
      lte: mkey.max(),
      values: true
    });

    let total = 0;

    for await (const {key, value} of iter) {
      const [hash, index] = mkey.decode(key);
      assert.equal(hash.toString('hex'), vectors[total].key[0]);
      assert.equal(index, vectors[total].key[1]);
      assert.equal(value.toString('hex'), vectors[total].value);
      total++;
    }

    assert.equal(total, vectors.length);
  });

  it('delete key and value', async () => {
    const hash = Buffer.alloc(20, 0x11);
    const key = tkey.encode(hash, 99);

    const batch = db.batch();
    batch.put(key, Buffer.from('foo'));
    await batch.write();

    const value = await db.get(key);
    assert.equal(value.toString('utf8'), 'foo');

    await db.del(key);

    const value2 = await db.get(key);
    assert.equal(value2, null);
  });

  describe('get keys in range', function() {
    let nkey, bucket = null;

    before(async () => {
      nkey = bdb.key('n', ['hash160', 'uint32']);
      bucket = db.bucket(prefix.encode());

      const batch = bucket.batch();

      for (let i = 0; i < vectors.length; i++) {
        const vector = vectors[i];

        const key = nkey.encode(Buffer.from(vector.key[0], 'hex'),
                                vector.key[1]);

        const value = Buffer.from(vector.value, 'hex');

        batch.put(key, value);
      }

      await batch.write();
    });

    it('in standard order', async () => {
      const keys = await bucket.keys({
        gte: nkey.min(),
        lte: nkey.max()
      });

      assert.equal(keys.length, vectors.length);

      for (let i = 0; i < keys.length; i++) {
        const [hash, index] = nkey.decode(keys[i]);
        assert.equal(hash.toString('hex'), vectors[i].key[0]);
        assert.equal(index, vectors[i].key[1]);
      }
    });

    it('in reverse order', async () => {
      const keys = await bucket.keys({
        gte: nkey.min(),
        lte: nkey.max(),
        reverse: true
      });

      assert.equal(keys.length, vectors.length);

      keys.reverse();

      for (let i = 0; i < keys.length; i++) {
        const [hash, index] = nkey.decode(keys[i]);
        assert.equal(hash.toString('hex'), vectors[i].key[0]);
        assert.equal(index, vectors[i].key[1]);
      }
    });
  });

  describe('Async Iterator', function() {
    let nkey, bucket = null;

    before(async () => {
      nkey = bdb.key('n', ['hash160', 'uint32']);
      bucket = db.bucket(prefix.encode());

      const batch = bucket.batch();

      for (let i = 0; i < vectors.length; i++) {
        const vector = vectors[i];

        const key = nkey.encode(Buffer.from(vector.key[0], 'hex'),
                                vector.key[1]);

        const value = Buffer.from(vector.value, 'hex');

        batch.put(key, value);
      }

      await batch.write();
    });

    it('in standard order', async () => {
      const keysIter = bucket.keysAsync({
        gte: nkey.min(),
        lte: nkey.max()
      });

      const keys = [];

      for await (const key of keysIter)
        keys.push(key);

      assert.equal(keys.length, vectors.length);

      for (let i = 0; i < keys.length; i++) {
        const [hash, index] = nkey.decode(keys[i]);
        assert.equal(hash.toString('hex'), vectors[i].key[0]);
        assert.equal(index, vectors[i].key[1]);
      }
    });

    it('in reverse order', async () => {
      const keysIter = bucket.keysAsync({
        gte: nkey.min(),
        lte: nkey.max(),
        reverse: true
      });

      const keys = [];

      for await (const key of keysIter)
        keys.push(key);

      assert.equal(keys.length, vectors.length);

      keys.reverse();

      for (let i = 0; i < keys.length; i++) {
        const [hash, index] = nkey.decode(keys[i]);
        assert.equal(hash.toString('hex'), vectors[i].key[0]);
        assert.equal(index, vectors[i].key[1]);
      }
    });

    it('should break and close iterator', async () => {
      const valuesIter = bucket.valuesAsync({
        gte: nkey.min(),
        lte: nkey.max()
      });

      const values = [];

      for await (const value of valuesIter) {
        values.push(value);
        break;
      }

      assert.strictEqual(values.length, 1);
      assert.strictEqual(values[0].toString('hex'), vectors[0].value);
      assert.strictEqual(valuesIter.finished, true);
    });

    it('should return and close iterator', async () => {
      const valuesIter = bucket.valuesAsync({
        gte: nkey.min(),
        lte: nkey.max()
      });

      const values = [];

      const fn = async () => {
        for await (const value of valuesIter) {
          values.push(value);
          return;
        }
      };

      await fn();

      assert.strictEqual(values.length, 1);
      assert.strictEqual(values[0].toString('hex'), vectors[0].value);
      assert.strictEqual(valuesIter.finished, true);
    });

    it('should throw and close iterator', async () => {
      const msg = 'Error at some point.';
      const valuesIter = bucket.valuesAsync({
        gte: nkey.min(),
        lte: nkey.max()
      });

      const values = [];

      const fn = async () => {
        for await (const value of valuesIter) {
          values.push(value);
          throw new Error(msg);
        }
      };

      let err;
      try {
        await fn();
      } catch (e) {
        err = e;
      }

      assert(err);
      assert.strictEqual(err.message, msg);

      assert.strictEqual(values.length, 1);
      assert.strictEqual(values[0].toString('hex'), vectors[0].value);
      assert.strictEqual(valuesIter.finished, true);
    });

    it('should pass iterator to fn', async () => {
      const valuesIter = bucket.valuesAsync({
        gte: nkey.min(),
        lte: nkey.max()
      });

      const filter = async function*(iter) {
        for await (const item of iter) {
          if (item[0] === 0x8b)
            yield item;

          continue;
        }
      };

      const values = [];

      for await (const value of filter(valuesIter))
        values.push(value);

      assert.strictEqual(values.length, 1);
      assert.strictEqual(values[0][0], 0x8b);
    });
  });

  describe('thread safety', function() {
    async function checkError(method, message) {
      const batch = db.batch();
      const hash = Buffer.alloc(20, 0x11);

      const value = Buffer.alloc(1024 * 1024);
      const key = tkey.encode(hash, 12);

      batch.put(key, value);
      batch.write();

      let err = null;

      try {
        switch (method) {
          case 'clear':
            batch.clear();
            break;
          case 'put':
            batch.put(key, value);
            break;
          case 'del':
            batch.del(key);
            break;
          case 'write':
            await batch.write();
            break;
        }
      } catch (e) {
        err = e;
      }

      assert(err);
      assert.equal(err.message, message);
      await new Promise(r => setTimeout(r, 200));
    }

    const methods = {
      'clear': 'Unsafe batch clear.',
      'put': 'Unsafe batch put.',
      'del': 'Unsafe batch del.',
      'write': 'Unsafe batch write.'
    };

    for (const [method, message] of Object.entries(methods)) {
      it(`will check safety of ${method}`, async () => {
        await checkError(method, message);
      });
    }
  });

  describe('key types', function() {
    function randomValue() {
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(Math.random() * 0xffffffff);
      return buf;
    }

    const valid = [
      ['char', 'a', 'b', '*'],
      ['uint8', 0, 100, 255],
      ['uint16', 0, 65000, 0xffff],
      ['uint32', 0, 0xffffff00, 0xffffffff],
      ['uint64', 0, 0x12345678901234, 2**53 - 1],
      ['buffer', Buffer.alloc(0), Buffer.alloc(100, 0xfe), Buffer.alloc(255, 0x00)]
    ];

    for (const test of valid) {
      const type = test.shift();
      it(`test valid key for type: ${type}`, async () => {
        for (const keyData of test) {
          const key = bdb.key('x', [type]);
          const val = randomValue();

          const b = db.batch();
          b.put(key.encode(keyData), val);
          await b.write();

          const gotten = await db.get(key.encode(keyData));
          assert(gotten.equals(val));
        }
      });
    }

    const invalid = [
      ['char', 1, 'abc', Buffer.alloc(0)],
      ['uint8', 'a', -1, 0xff + 1],
      ['uint16', 'a', -1, 0xffff + 1],
      ['uint32', 'a', -1, 0xffffffff + 1],
      ['uint64', 'a', -1, 2**53],
      ['buffer', 'a', 0xdeadbeef, Buffer.alloc(256, 0x00)]
    ];

    for (const test of invalid) {
      const type = test.shift();
      it(`test invalid key for type: ${type}`, () => {
        for (const keyData of test) {
          const key = bdb.key('x', [type]);

          try {
            key.encode(keyData);
            assert(false, 'Should throw');
          } catch (e) {
            assert(e.message.match(/Invalid (type|length) for database key./));
          }
        }
      });
    }

    const encoded = [
      ['0000000000ffffff', Buffer.from('780000000000ffffff', 'hex')],
      ['00000000ffffffff', Buffer.from('7800000000ffffffff', 'hex')],
      ['000000ffffffffff', Buffer.from('78000000ffffffffff', 'hex')],
      ['001fffffffffffff', Buffer.from('78001fffffffffffff', 'hex')]
    ];

    for (const test of encoded) {
      const key = bdb.key('x', ['uint64']);

      it(`should encode 64-bit key: ${test[0]}`, () => {
        const encoded = key.encode(parseInt(test[0], 16));
        assert.bufferEqual(encoded, test[1]);
      });

      it(`should decode 64-bit key: ${test[0]}`, () => {
        const decoded = key.decode(test[1])[0];
        assert.strictEqual(decoded, parseInt(test[0], 16));
      });
    }
  });
});
