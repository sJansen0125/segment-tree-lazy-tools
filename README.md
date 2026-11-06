# segment-tree-lazy-tools

A small, dependency-free TypeScript/JavaScript library implementing a segment tree with lazy propagation. Supports range updates and range queries for associative operations where lazy values can be composed.

## Usage

```js
import { createLazySegmentTree, sumMonoid, minAssignMonoid } from 'segment-tree-lazy-tools';

const data = [1, 2, 3, 4, 5];
const tree = createLazySegmentTree(data, sumMonoid);

tree.update(1, 4, 10);            // add 10 to indices 1, 2, 3 (half-open [1, 4))
tree.query(1, 4);                // 33  (2+10 + 3+10 + 4+10)
tree.query(0, 5);                // 31
tree.get(3);                     // 14
tree.set(2, 100);                // overwrite index 2 with 100
tree.query(0, 5);                // 128

const m = createLazySegmentTree([5, 4, 3, 2, 1], minAssignMonoid);
m.update(0, 5, 10);              // assign 10 to all elements
m.query(0, 5);                   // 10 (range min)
m.update(2, 4, 3);               // assign 3 to indices 2, 3
m.query(0, 5);                   // 3
```

## Why this exists

The problem is the classic one: you have an array, you want to support "add v to every element in a range" and "what is the sum/min/max over a range" — and you want both operations in O(log n) rather than O(n). A segment tree with lazy propagation gives you that, but the implementation is easy to get wrong: forgotten `pushDown`, wrong child-coverage test, or a lazy-composition that silently breaks on the second update.

This library implements the general lazy-segment-tree pattern once, correctly, and exposes it through a single constructor `createLazySegmentTree(data, monoid)` plus a small set of monoid definitions (`sumMonoid`, `minAssignMonoid`). Range updates and queries are half-open `[l, r)`. Point operations (`get`, `set`) are provided because they're what callers actually reach for once the tree exists, and `set` in particular must push pending lazy tags down the path to the target leaf before writing — getting that wrong is the usual silent-corruption bug.

## Exports

- `createLazySegmentTree(data, monoid)` — returns `{ size, update, query, get, set }`.
- `sumMonoid` — range-add updates with range-sum queries.
- `minAssignMonoid` — range-assign updates with range-min queries.

The `monoid` argument requires four fields:

- `applyTo(acc, lazy, len)` — fold a pending lazy value into a node's aggregate over `len` elements.
- `combine(a, b)` — merge two child aggregates.
- `identity` — neutral element for `combine`.
- `composeLazy(pending, v)` — combine a node's existing pending lazy with a newly arriving one.

## Edge cases

- Half-open ranges: `query(2, 2)` is valid and returns `identity`; `update(2, 2, v)` is a no-op.
- Out-of-bounds indices or inverted ranges (`l > r`) throw `RangeError`.
- `get`/`set` on an empty tree throw `RangeError`; `query`/`update` on an empty tree with `l == r == 0` also throw, since `n === 0` is treated as "no valid range exists."
- `set(i, v)` after pending range updates correctly composes: the implementation pushes lazy tags down the path to leaf `i` before overwriting, so the new value is not corrupted by a stale pending tag sitting on an ancestor.
- Internal tree size is rounded up to the next power of two; `get`/`query` never expose the padding region to the caller.

## Testing

Tests run under `node --test` using `node:test` and `node:assert/strict`. The suite covers initial-state queries, single and overlapping range updates, point get/set after pending updates, assign-and-min behaviour, out-of-bounds rejection, and a fuzz-style comparison against a brute-force reference over 200 random small arrays with a fixed seed.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

