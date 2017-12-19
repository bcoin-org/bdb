# bdb

Database for bcoin.

## Usage

``` js
const bdb = require('bdb');

const db = bdb.create({
  location: './mydb'
});

await db.open();

const root = bdb.key('r');
const rec = bdb.key('t', ['hash160', 'uint32']);

const bucket = db.bucket(root.build());
const batch = bucket.batch();

const hash = Buffer.alloc(20, 0x11);

// Write `foo` to `rt[1111111111111111111111111111111111111111][00000000]`.
batch.put(rec.build(hash, 0), Buffer.from('foo'));

await batch.write();

// Iterate:
// From: `rt[0000000000000000000000000000000000000000][00000000]`
// To: `rt[ffffffffffffffffffffffffffffffffffffffff][ffffffff]`
const iter = bucket.iterator({
  gte: rec.min(),
  lte: rec.max(),
  values: true
});

await iter.each((key, value) => {
  // Parse each key.
  const [hash, uint] = rec.parse(key);
  console.log('Hash: %s', hash);
  console.log('Uint: %d', uint);
  console.log('Value: %s', value.toString('ascii'));
});

await db.close();

```

## Contribution and License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## License

- Copyright (c) 2017, Christopher Jeffrey (MIT License).

See LICENSE for more info.
