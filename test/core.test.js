import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLazySegmentTree, sumMonoid, minAssignMonoid } from '../src/index.js';

const seq = (lo, hi) => Array.from({ length: hi - lo }, (_, i) => i + lo);

test('range query over initial data matches a linear scan', () => {
  const data = [5, 2, 8, 1, 9, 4, 7, 3];
  const t = createLazySegmentTree(data, sumMonoid);
  assert.equal(t.query(0, 8), 39);
  assert.equal(t.query(2, 5), 18);
  assert.equal(t.query(0, 1), 5);
  assert.equal(t.query(7, 8), 3);
});

test('range add updates the affected range only', () => {
  const t = createLazySegmentTree([1, 1, 1, 1, 1], sumMonoid);
  t.update(1, 4, 10);
  assert.equal(t.query(0, 5), 35);
  assert.equal(t.query(0, 1), 1);
  assert.equal(t.query(1, 4), 33);
  assert.equal(t.query(4, 5), 1);
});

test('overlapping range updates accumulate correctly', () => {
  const t = createLazySegmentTree([0, 0, 0, 0, 0, 0], sumMonoid);
  t.update(0, 6, 1);
  t.update(1, 5, 2);
  t.update(2, 4, 3);
  // index:   0  1  2  3  4  5
  // value:   1  3  6  6  3  1   sum = 20
  assert.equal(t.query(0, 6), 20);
  assert.equal(t.query(2, 4), 12);
  assert.equal(t.query(0, 1), 1);
  assert.equal(t.query(5, 6), 1);
});

test('query and update on single-element arrays', () => {
  const t = createLazySegmentTree([7], sumMonoid);
  assert.equal(t.query(0, 1), 7);
  t.update(0, 1, 5);
  assert.equal(t.query(0, 1), 12);
});

test('empty range queries return identity', () => {
  const t = createLazySegmentTree([1, 2, 3, 4], sumMonoid);
  assert.equal(t.query(2, 2), 0);
  assert.equal(t.query(0, 0), 0);
});

test('empty range update is a no-op', () => {
  const t = createLazySegmentTree([1, 2, 3, 4], sumMonoid);
  t.update(1, 1, 100);
  assert.equal(t.query(0, 4), 10);
});

test('size matches input length', () => {
  assert.equal(createLazySegmentTree([], sumMonoid).size(), 0);
  assert.equal(createLazySegmentTree([1], sumMonoid).size(), 1);
  assert.equal(createLazySegmentTree([1, 2, 3], sumMonoid).size(), 3);
});

test('get(i) reflects pending range updates', () => {
  const t = createLazySegmentTree([1, 2, 3, 4, 5], sumMonoid);
  t.update(0, 5, 10);
  assert.equal(t.get(0), 11);
  assert.equal(t.get(3), 14);
  t.update(2, 5, 100);
  assert.equal(t.get(0), 11);
  assert.equal(t.get(2), 113);
  assert.equal(t.get(4), 115);
  // query still works after get mutated nothing
  assert.equal(t.query(0, 5), 11 + 12 + 113 + 114 + 115);
});

test('set(i) overwrites the element and recomputes ancestors', () => {
  const t = createLazySegmentTree([1, 2, 3, 4, 5], sumMonoid);
  t.set(2, 30);
  assert.equal(t.get(2), 30);
  assert.equal(t.query(0, 5), 42);
});

test('set(i) after a range update composes correctly', () => {
  const t = createLazySegmentTree([1, 2, 3, 4, 5], sumMonoid);
  t.update(0, 5, 10);          // [11, 12, 13, 14, 15]
  t.set(2, 100);               // [11, 12, 100, 14, 15]
  assert.equal(t.get(0), 11);
  assert.equal(t.get(2), 100);
  assert.equal(t.get(3), 14);
  assert.equal(t.query(0, 5), 152);
});

test('range-assign with min query updates correctly', () => {
  const data = [5, 4, 3, 2, 1];
  const t = createLazySegmentTree(data, minAssignMonoid);
  assert.equal(t.query(0, 5), 1);
  t.update(0, 5, 10);          // all become 10
  assert.equal(t.query(0, 5), 10);
  assert.equal(t.get(0), 10);
  t.update(2, 4, 3);           // middle two become 3
  assert.equal(t.query(0, 5), 3);
  assert.equal(t.get(0), 10);
  assert.equal(t.get(2), 3);
  assert.equal(t.get(3), 3);
  assert.equal(t.get(4), 10);
});

test('min-assign respects query bounds and overlapping assigns', () => {
  const t = createLazySegmentTree([10, 10, 10, 10, 10, 10], minAssignMonoid);
  t.update(0, 6, 5);
  t.update(2, 4, 1);
  t.update(1, 5, 9);
  // [5, 9, 9, 9, 9, 5]
  assert.equal(t.query(0, 6), 5);
  assert.equal(t.query(1, 5), 9);
  assert.equal(t.query(2, 4), 9);
  assert.equal(t.get(0), 5);
  assert.equal(t.get(2), 9);
});

test('lazy tags accumulate across many small updates', () => {
  const t = createLazySegmentTree([0, 0, 0, 0], sumMonoid);
  for (let k = 0; k < 50; k++) {
    t.update(0, 4, 1);
  }
  assert.equal(t.query(0, 4), 200);
  assert.equal(t.get(0), 50);
  assert.equal(t.get(3), 50);
});

test('out-of-bounds throws RangeError', () => {
  const t = createLazySegmentTree([1, 2, 3], sumMonoid);
  assert.throws(() => t.query(-1, 2), RangeError);
  assert.throws(() => t.query(1, 5), RangeError);
  assert.throws(() => t.update(0, 4, 1), RangeError);
  assert.throws(() => t.update(-1, 2, 1), RangeError);
  assert.throws(() => t.get(-1), RangeError);
  assert.throws(() => t.get(3), RangeError);
  assert.throws(() => t.set(-1, 0), RangeError);
  assert.throws(() => t.set(3, 0), RangeError);
  assert.throws(() => t.query(2, 1), RangeError);
});

test('invalid monoid throws TypeError', () => {
  assert.throws(() => createLazySegmentTree([1], null), TypeError);
  assert.throws(() => createLazySegmentTree([1], {}), TypeError);
});

test('non-array data throws TypeError', () => {
  assert.throws(() => createLazySegmentTree('abc', sumMonoid), TypeError);
});

test('array of length 0, 2, and 8 round-trips a full scan', () => {
  for (const n of [0, 2, 8]) {
    const data = seq(1, n + 1);
    const t = createLazySegmentTree(data, sumMonoid);
    const expected = data.reduce((a, b) => a + b, 0);
    const actual = n === 0 ? 0 : t.query(0, n);
    assert.equal(actual, expected, `n=${n}`);
  }
});

test('interleaved updates and queries stay consistent', () => {
  const t = createLazySegmentTree([0, 0, 0, 0, 0, 0, 0, 0], sumMonoid);
  t.update(0, 4, 1);
  assert.equal(t.query(0, 4), 4);
  assert.equal(t.query(4, 8), 0);
  t.update(4, 8, 2);
  assert.equal(t.query(4, 8), 8);
  assert.equal(t.query(0, 8), 12);
  t.update(2, 6, 5);
  // [1,1,6,6,7,7,2,2] sum = 32
  assert.equal(t.query(0, 8), 32);
  assert.equal(t.get(2), 6);
  assert.equal(t.get(5), 7);
  t.set(3, 0);
  assert.equal(t.query(0, 8), 26);
  assert.equal(t.get(3), 0);
});

test('build does not mutate input array', () => {
  const data = [3, 1, 4, 1, 5, 9, 2, 6];
  const snapshot = [...data];
  const t = createLazySegmentTree(data, sumMonoid);
  t.update(0, data.length, 100);
  assert.deepEqual(data, snapshot);
});

test('many random small arrays with reference comparison', () => {
  // Pure random with a fixed xorshift so the run is reproducible across
  // machines. No Date.now(), no crypto, no Math.random().
  let s = 123456789;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s; };

  for (let iter = 0; iter < 200; iter++) {
    const n = 1 + (next() % 8);
    const data = Array.from({ length: n }, () => next() % 20);
    const ref = [...data];
    const t = createLazySegmentTree(data, sumMonoid);

    for (let op = 0; op < 20; op++) {
      const a = next() % n;
      const b = next() % n;
      const l = Math.min(a, b);
      const r = Math.max(a, b) + 1;
      if (next() & 1) {
        const v = (next() % 20) - 10;
        t.update(l, r, v);
        for (let i = l; i < r; i++) ref[i] += v;
      } else {
        let expected = 0;
        for (let i = l; i < r; i++) expected += ref[i];
        assert.equal(t.query(l, r), expected, `iter=${iter} op=${op} [${l},${r})`);
      }
    }
  }
});

test('get and set on empty array throw', () => {
  const t = createLazySegmentTree([], sumMonoid);
  assert.equal(t.size(), 0);
  assert.throws(() => t.get(0), RangeError);
  assert.throws(() => t.set(0, 1), RangeError);
});
