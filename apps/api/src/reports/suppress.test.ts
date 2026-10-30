import { describe, expect, it } from 'vitest';
import { csvCell, csvRow, suppressCount, suppressGroup, type Cell } from './suppress.js';

const P = { awaiting: 0, confirmed: 0, alternative: 0, cancelled: 0, expired: 0 };

describe('suppressCount', () => {
  it.each([0, 1, 2, 3, 4])('%i is suppressed', (n) => expect(suppressCount(n)).toBe('<5'));
  it.each([5, 6, 100])('%i is published', (n) => expect(suppressCount(n)).toBe(n));
});

describe('suppressGroup', () => {
  it('suppresses everything when the total is below 5 (including all zero)', () => {
    expect(suppressGroup(0, P)).toEqual({ total: '<5', parts: { awaiting: '<5', confirmed: '<5', alternative: '<5', cancelled: '<5', expired: '<5' } });
    const g = suppressGroup(4, { ...P, confirmed: 3, expired: 1 });
    expect(g.total).toBe('<5');
    expect(Object.values(g.parts).every((v) => v === '<5')).toBe(true);
  });

  it('publishes a group where every cell is >= 5', () => {
    const parts = { awaiting: 5, confirmed: 6, alternative: 7, cancelled: 8, expired: 9 };
    expect(suppressGroup(35, parts)).toEqual({ total: 35, parts });
  });

  it('exactly 5 is published, 4 is not', () => {
    // Hidden cells sum to 4 + 1 = 5, so nothing extra needs hiding (S9-3 rule: hidden sum >= 5).
    const g = suppressGroup(15, { ...P, confirmed: 5, cancelled: 5, awaiting: 4, expired: 1 });
    expect(g.parts.confirmed).toBe(5);
    expect(g.parts.cancelled).toBe(5);
    expect(g.parts.awaiting).toBe('<5');
    expect(g.parts.expired).toBe('<5');
    // Superseded: with only zero cells hidden (sum 0) one 5 is hidden too, so the zeros are not derivable.
    const z = suppressGroup(10, { ...P, confirmed: 5, cancelled: 5 });
    expect(z.parts.confirmed).toBe('<5');
    expect(z.parts.cancelled).toBe(5);
  });

  it('complementary suppression: one hidden cell with a published total also hides the next smallest cell', () => {
    const one = suppressGroup(32, { awaiting: 2, confirmed: 10, alternative: 8, cancelled: 6, expired: 6 });
    expect(one.total).toBe(32);
    expect(one.parts.awaiting).toBe('<5');
    // next smallest published cell (cancelled, first of the 6s) is hidden so awaiting cannot be derived
    expect(one.parts.cancelled).toBe('<5');
    expect(one.parts.expired).toBe(6);
    expect(one.parts.confirmed).toBe(10);
    expect(one.parts.alternative).toBe(8);
  });

  it('S9-3: several hidden cells whose SUM is below 5 also hide the next smallest published cell', () => {
    // Superseded old expectation (3 hidden cells, sum 3, was left as-is): total 23 minus the published 12 and 8 would
    // reveal the hidden sum 3, so the 8 is hidden as well and only 12 stays published.
    const g = suppressGroup(23, { awaiting: 3, confirmed: 12, alternative: 8, cancelled: 0, expired: 0 });
    expect(g.total).toBe(23);
    expect(g.parts).toEqual({ awaiting: '<5', confirmed: 12, alternative: '<5', cancelled: '<5', expired: '<5' });
  });

  it('S9-3: suppresses the total when nothing is left to hide and the hidden sum is still below 5', () => {
    const g = suppressGroup(9, { a: 2, b: 2 });
    expect(g).toEqual({ total: '<5', parts: { a: '<5', b: '<5' } });
  });

  it('S9-3: a lone big cell with only zeros beside it is hidden so the zeros cannot be derived', () => {
    expect(suppressGroup(20, { a: 20, b: 0, c: 0 })).toEqual({ total: 20, parts: { a: '<5', b: '<5', c: '<5' } });
  });

  it('a suppressed cell can never be derived from total minus the published cells', () => {
    for (let a = 0; a <= 12; a += 1) {
      for (let b = 0; b <= 12; b += 1) {
        const parts = { awaiting: a, confirmed: b, alternative: 7, cancelled: 9, expired: 11 };
        const g = suppressGroup(a + b + 27, parts);
        const hidden = Object.values(g.parts).filter((v) => v === '<5').length;
        expect(hidden === 1, `a=${a} b=${b}`).toBe(false);
      }
    }
  });
});

describe('suppressGroup property (S9-3)', () => {
  // Exhaustive over 2..4 components with values 0..12, total = sum of components.
  function check(vals: number[]): void {
    const keys = vals.map((_, i) => `k${i}`);
    const parts = Object.fromEntries(keys.map((k, i) => [k, vals[i] as number])) as Record<string, number>;
    const total = vals.reduce((x, y) => x + y, 0);
    const g = suppressGroup(total, parts);
    const label = JSON.stringify(vals);
    const cells = keys.map((k) => g.parts[k] as Cell);
    const published = cells.filter((c): c is number => c !== '<5');
    keys.forEach((k, i) => {
      const c = cells[i] as Cell;
      if (c !== '<5') {
        expect(c, label).toBe(parts[k]);
        expect(c, label).toBeGreaterThanOrEqual(5);
      } else {
        // never publish a cell that is hidden-then-recomputed; every component below 5 is hidden
      }
      if ((parts[k] as number) < 5) expect(c, label).toBe('<5');
    });
    if (g.total === '<5') {
      // Fully suppressed group: nothing is derivable at all.
      expect(published, label).toEqual([]);
      return;
    }
    expect(g.total, label).toBe(total);
    if (cells.length - published.length > 0) {
      // total minus the published cells == the hidden sum; it must not fall in [0,4] (covers single hidden values too).
      const derivedHiddenSum = total - published.reduce((x, y) => x + y, 0);
      expect(derivedHiddenSum, label).toBeGreaterThanOrEqual(5);
    }
  }
  function walk(n: number): void {
    const vals: number[] = new Array<number>(n).fill(0);
    const rec = (i: number): void => {
      if (i === n) {
        check(vals);
        return;
      }
      for (let v = 0; v <= 12; v += 1) {
        vals[i] = v;
        rec(i + 1);
      }
    };
    rec(0);
  }
  it.each([2, 3, 4])('no hidden value or hidden sum below 5 is derivable with %i components', (n) => walk(n));
  it('also holds for the 5-component report shape on a coarse grid', () => {
    for (const a of [0, 3, 5, 9]) for (const b of [0, 4, 6]) for (const c of [0, 1, 7]) for (const d of [0, 5, 12]) for (const e of [0, 2, 8]) check([a, b, c, d, e]);
  });
});

describe('csv cells', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralises a formula start %j', (v) => {
    expect(csvCell(v).replace(/^"/, '').startsWith("'")).toBe(true);
  });
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
  it('leaves plain tokens, numbers and <5 untouched', () => {
    expect(csvRow(['2026-10', 'received', 12])).toBe('2026-10,received,12');
    expect(csvCell('<5')).toBe('<5');
  });
});
