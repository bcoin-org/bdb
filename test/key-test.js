'use strict';

const assert = require('bsert');
const bdb = require('..');

const BUFFER_MIN = Buffer.alloc(0);
const BUFFER_MAX = Buffer.alloc(255, 0xff);

const KEY_IDS = [{
  str: 'a',
  num: 0x61, // 'a'
  buf: Buffer.from('a', 'ascii'),
  expected: Buffer.from('a', 'ascii')
}, {
  str: 'A',
  num: 0x41, // 'A'
  buf: Buffer.from('A', 'ascii'),
  expected: Buffer.from('A', 'ascii')
}, {
  str: 'z',
  num: 0x7a, // 'z'
  buf: Buffer.from('z', 'ascii'),
  expected: Buffer.from('z', 'ascii')
}, {
  str: 'aa',
  num: null, // does not support.
  buf: Buffer.from('aa', 'ascii'),
  expected: Buffer.from('aa', 'ascii')
}, {
  str: 'abcd',
  num: null, // does not support.
  buf: Buffer.from('abcd', 'ascii'),
  expected: Buffer.from('abcd', 'ascii')
}];

const KEY_OPS = [{
  ops: [],
  values: [],
  expected: Buffer.alloc(0),
  mins: [],
  expectedMins: Buffer.alloc(0),
  maxes: [],
  expectedMaxes: Buffer.alloc(0)
}, {
  ops: ['uint32'],
  values: [0xdeadbeef],
  expected: Buffer.from('deadbeef', 'hex'),
  mins: [0x0],
  expectedMins: Buffer.from('00000000', 'hex'),
  maxes: [0xffffffff],
  expectedMaxes: Buffer.from('ffffffff', 'hex')
}, {
  ops: ['char', 'uint16', 'buffer'],
  values: ['c', 0xdead, Buffer.from('beef', 'hex')],
  expected: Buffer.from('63dead02beef', 'hex'),
  mins: ['\x00', 0x0, BUFFER_MIN],
  expectedMins: Buffer.concat([
    Buffer.from('000000', 'hex'),
    Buffer.from([0]) // length of the buffer.
  ]),
  maxes: ['\xff', 0xffff, BUFFER_MAX],
  expectedMaxes: Buffer.concat([
    Buffer.from('ffffff', 'hex'),
    Buffer.from([BUFFER_MAX.length]),
    BUFFER_MAX
  ])
}];

describe('Key', function() {
  for (const KEY_ID of KEY_IDS) {
    it(`should create key for ${KEY_ID.str} (str)`, () => {
      const key = bdb.key(KEY_ID.str);

      assert.bufferEqual(key.encode(), KEY_ID.expected);
      assert.bufferEqual(key.min(), KEY_ID.expected);
      assert.bufferEqual(key.max(), KEY_ID.expected);
      assert.deepStrictEqual(key.decode(KEY_ID.expected), []);
      assert.bufferEqual(key.root(), KEY_ID.buf);
    });

    it(`should create key for ${KEY_ID.str} (num)`, () => {
      if (KEY_ID.num == null) {
        this.skip();
        return;
      }

      const key = bdb.key(KEY_ID.num);

      assert.bufferEqual(key.encode(), KEY_ID.expected);
      assert.bufferEqual(key.min(), KEY_ID.expected);
      assert.bufferEqual(key.max(), KEY_ID.expected);
      assert.deepStrictEqual(key.decode(KEY_ID.expected), []);
      assert.bufferEqual(key.root(), KEY_ID.buf);
    });

    it(`should create key for ${KEY_ID.str} (buf)`, () => {
      const key = bdb.key(KEY_ID.buf);

      assert.bufferEqual(key.encode(), KEY_ID.expected);
      assert.bufferEqual(key.min(), KEY_ID.expected);
      assert.bufferEqual(key.max(), KEY_ID.expected);
      assert.deepStrictEqual(key.decode(KEY_ID.expected), []);
      assert.bufferEqual(key.root(), KEY_ID.buf);
    });

    for (const KEY_OP of KEY_OPS) {
      const key = bdb.key(KEY_ID.str, KEY_OP.ops);

      it(`should encode ${KEY_ID.str} with ops ${KEY_OP.ops}`, () => {
        const encoded = key.encode(...KEY_OP.values);
        const expected = Buffer.concat([
          KEY_ID.expected,
          KEY_OP.expected
        ]);

        assert.bufferEqual(encoded, expected);
      });

      it(`should get max for ${KEY_ID.str} with ops ${KEY_OP.ops}`, () => {
        const max = key.max();
        const expected = Buffer.concat([
          KEY_ID.expected,
          KEY_OP.expectedMaxes
        ]);

        assert.bufferEqual(max, expected);
      });

      it(`should get min for ${KEY_ID.str} with ops ${KEY_OP.ops}`, () => {
        const min = key.min();
        const expected = Buffer.concat([
          KEY_ID.expected,
          KEY_OP.expectedMins
        ]);

        assert.bufferEqual(min, expected);
      });

      it(`should get root for ${KEY_ID.str} with ops ${KEY_OP.ops}`, () => {
        const root = key.root();
        assert.bufferEqual(root, KEY_ID.buf);
      });

      it(`should decode ${KEY_ID.str} with ops ${KEY_OP.ops}`, () => {
        const decoded = key.decode(Buffer.concat([
          KEY_ID.expected,
          KEY_OP.expected
        ]));

        assert.deepStrictEqual(decoded, KEY_OP.values);
      });

      it(`should decode min for ${KEY_ID.str} with ops ${KEY_OP.ops}`, () => {
        const decodedMin = key.decode(Buffer.concat([
          KEY_ID.expected,
          KEY_OP.expectedMins
        ]));

        assert.deepStrictEqual(decodedMin, KEY_OP.mins);
      });

      it(`should decode max for ${KEY_ID.str} with ops ${KEY_OP.ops}`, () => {
        const decodedMax = key.decode(Buffer.concat([
          KEY_ID.expected,
          KEY_OP.expectedMaxes
        ]));

        assert.deepStrictEqual(decodedMax, KEY_OP.maxes);
      });
    }
  }
});
