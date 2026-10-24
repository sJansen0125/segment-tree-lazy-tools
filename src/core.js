/**
 * Core segment tree with lazy propagation.
 *
 * Design decisions:
 * - Iterative bottom-up for point reads and single-value writes: simpler,
 *   branch-light, and the loop bounds fall out of the heap layout.
 * - Recursive top-down for range queries and range updates: the "push down on
 *   the way, pull up on the way back" pattern reads cleanly in recursion and
 *   is awkward to express iteratively without a hand-rolled stack. The tree
 *   is small enough that recursion depth (O(log n)) is never a problem.
 * - General monoid form (user supplies applyTo, combine, identity) rather
 *   than hard-coding sum. Supporting range-assign alongside range-add, or
 *   range-max-of-min, only costs a call per node and keeps the file honest.
 */

/**
 * Build a lazy segment tree over an array of starting values.
 *
 * @param {number[]} data - Initial per-element values.
 * @param {object} monoid - Operation set for the tree.
 * @param {(acc: number, lazy: number, len: number) => number} monoid.applyTo
 *   Fold a pending lazy value into an aggregate over `len` elements.
 *   For sum-of-add: (acc, lazy, len) => acc + lazy * len.
 * @param {(a: number, b: number) => number} monoid.combine
 *   Merge two child aggregates into one.
 * @param {number} monoid.identity
 *   Neutral element for `combine`.
 * @param {(pending: number, newLazy: number) => number} monoid.composeLazy
 *   Combine a node's existing pending lazy with a newly arriving one.
 */
export function createLazySegmentTree(data, monoid) {
  if (!Array.isArray(data)) {
    throw new TypeError('data must be an array');
  }
  const { applyTo, combine, identity, composeLazy } = monoid;
  if (typeof applyTo !== 'function') throw new TypeError('monoid.applyTo must be a function');
  if (typeof combine !== 'function') throw new TypeError('monoid.combine must be a function');
  if (typeof identity !== 'number') throw new TypeError('monoid.identity must be a number');
  if (typeof composeLazy !== 'function') throw new TypeError('monoid.composeLazy must be a function');

  const n = data.length;
  const leafCount = n <= 1 ? 1 : 1 << (32 - Math.clz32(n - 1));
  const nodeCount = 2 * leafCount;
  const value = new Float64Array(nodeCount);
  const lazy = new Float64Array(nodeCount);
  const pending = new Uint8Array(nodeCount);

  value.fill(identity);

  for (let i = 0; i < n; i++) {
    value[leafCount + i] = data[i];
  }
  for (let i = leafCount - 1; i >= 1; i--) {
    value[i] = combine(value[2 * i], value[2 * i + 1]);
  }

  function pushDown(i, lo, mid, hi) {
    if (!pending[i]) return;
    const l = lazy[i];
    lazy[i] = 0;
    pending[i] = 0;
    // Both children always exist in this layout (every internal node has a
    // right child, even when the right half falls outside the user's data);
    // pushing once to the right is cheaper than guarding every push.
    lazy[2 * i] = composeLazy(lazy[2 * i], l);
    pending[2 * i] = 1;
    lazy[2 * i + 1] = composeLazy(lazy[2 * i + 1], l);
    pending[2 * i + 1] = 1;
    const leftLen = mid - lo;
    const rightLen = hi - mid;
    value[2 * i] = applyTo(value[2 * i], l, leftLen);
    value[2 * i + 1] = applyTo(value[2 * i + 1], l, rightLen);
  }

  function updateRange(i, lo, hi, ql, qr, v) {
    if (ql >= hi || qr <= lo) return;
    if (ql <= lo && hi <= qr) {
      lazy[i] = composeLazy(lazy[i], v);
      pending[i] = 1;
      value[i] = applyTo(value[i], v, hi - lo);
      return;
    }
    const mid = lo + ((hi - lo) >> 1);
    pushDown(i, lo, mid, hi);
    updateRange(2 * i, lo, mid, ql, qr, v);
    updateRange(2 * i + 1, mid, hi, ql, qr, v);
    value[i] = combine(value[2 * i], value[2 * i + 1]);
  }

  function queryRange(i, lo, hi, ql, qr) {
    if (ql >= hi || qr <= lo) return identity;
    if (ql <= lo && hi <= qr) return value[i];
    const mid = lo + ((hi - lo) >> 1);
    pushDown(i, lo, mid, hi);
    return combine(
      queryRange(2 * i, lo, mid, ql, qr),
      queryRange(2 * i + 1, mid, hi, ql, qr),
    );
  }

  return {
    /** Current number of user-facing elements. */
    size() { return n; },

    /**
     * Add `lazy` to every element in [l, r). Half-open, [l, r).
     * @param {number} l
     * @param {number} r
     * @param {number} v
     */
    update(l, r, v) {
      if (n === 0) return;
      if (l < 0 || l > r || r > n) {
        throw new RangeError(`range [${l}, ${r}) out of bounds for size ${n}`);
      }
      if (l === r) return;
      updateRange(1, 0, leafCount, l, r, v);
    },

    /**
     * Read the aggregate over [l, r). Half-open, [l, r).
     * @param {number} l
     * @param {number} r
     * @returns {number}
     */
    query(l, r) {
      if (n === 0) return identity;
      if (l < 0 || l > r || r > n) {
        throw new RangeError(`range [${l}, ${r}) out of bounds for size ${n}`);
      }
      if (l === r) return identity;
      return queryRange(1, 0, leafCount, l, r);
    },

    /**
     * Read a single element. Cheaper than `query(i, i + 1)` because it walks
     * from the root down pushing lazy tags only on the path to leaf `i`,
     * instead of the full split-merge a range query does.
     * @param {number} i
     * @returns {number}
     */
    get(i) {
      if (n === 0) {
        throw new RangeError(`index ${i} out of bounds for size 0`);
      }
      if (i < 0 || i >= n) {
        throw new RangeError(`index ${i} out of bounds for size ${n}`);
      }
      let idx = leafCount + i;
      // Collect pending tags on the path so we don't mutate the tree just to
      // answer a point query. Every ancestor contributes its pending lazy to
      // the subtree containing leaf `i`.
      let v = value[idx];
      let node = idx >> 1;
      while (node >= 1) {
        if (pending[node]) {
          v = applyTo(v, lazy[node], 1);
        }
        node >>= 1;
      }
      return v;
    },

    /**
     * Replace element at index `i` with `v`.
     * @param {number} i
     * @param {number} v
     */
    set(i, v) {
      if (n === 0) {
        throw new RangeError(`index ${i} out of bounds for size 0`);
      }
      if (i < 0 || i >= n) {
        throw new RangeError(`index ${i} out of bounds for size ${n}`);
      }
      // Push down all pending tags on the path from root to leaf i, so the
      // write lands on a clean subtree; leaving the path dirty would mix the
      // new value with stale pending tags and corrupt the write.
      function pushPath(i_, lo, hi) {
        if (lo + 1 === hi) return;
        const mid = lo + ((hi - lo) >> 1);
        pushDown(i_, lo, mid, hi);
        if (i < mid) pushPath(2 * i_, lo, mid);
        else pushPath(2 * i_ + 1, mid, hi);
      }
      pushPath(1, 0, leafCount);

      let idx = leafCount + i;
      value[idx] = v;
      idx >>= 1;
      while (idx >= 1) {
        value[idx] = combine(value[2 * idx], value[2 * idx + 1]);
        idx >>= 1;
      }
    },
  };
}

/**
 * Monoid for range-add updates with range-sum queries.
 *   applyTo:  subtree sum increases by `lazy * len`.
 *   composeLazy: two pending adds compose by summing (a + b applied once
 *     equals a applied then b applied).
 */
export const sumMonoid = {
  applyTo: (acc, lazy, len) => acc + lazy * len,
  combine: (a, b) => a + b,
  identity: 0,
  composeLazy: (pending, v) => pending + v,
};

/**
 * Monoid for range-assign updates with range-min queries.
 *   applyTo:  every element of the subtree becomes `lazy`, so the min is `lazy`
 *     regardless of subtree length.
 *   composeLazy: a later assign wins, so the composed value is just `v`.
 *   identity must be larger than any value we store; positive-Infinity is
 *     naturally compatible with min and works under all numeric inputs.
 */
export const minAssignMonoid = {
  applyTo: (_acc, lazy, _len) => lazy,
  combine: (a, b) => a < b ? a : b,
  identity: Number.POSITIVE_INFINITY,
  composeLazy: (_pending, v) => v,
};
