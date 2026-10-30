/**
 * Small-cell suppression for aggregate reports. Pure functions, no I/O.
 *
 * Rules:
 *  1. Any count below SUPPRESSION_THRESHOLD (including 0) is published as the string '<5'.
 *  2. Complementary protection: a group is a published total plus its component cells. With the total published the
 *     SUM of the hidden components is derivable (total minus the published cells), so that sum must itself be >= the
 *     threshold. While at least one component is hidden and the hidden sum is still below the threshold, the smallest
 *     still-published component is hidden too (its value is >= the threshold, so one extra hide always suffices). If no
 *     published component is left to hide and the hidden sum is still below the threshold, the total is suppressed.
 *  3. A total below the threshold is suppressed, and then every component is too (each is <= the total).
 */
export const SUPPRESSION_THRESHOLD = 5;
export const SUPPRESSED = '<5' as const;

export type Cell = number | typeof SUPPRESSED;

export function suppressCount(n: number): Cell {
  return n < SUPPRESSION_THRESHOLD ? SUPPRESSED : n;
}

export interface SuppressedGroup<K extends string> {
  total: Cell;
  parts: Record<K, Cell>;
}

export function suppressGroup<K extends string>(total: number, parts: Record<K, number>): SuppressedGroup<K> {
  const keys = Object.keys(parts) as K[];
  const out = {} as Record<K, Cell>;
  if (total < SUPPRESSION_THRESHOLD) {
    for (const k of keys) out[k] = SUPPRESSED;
    return { total: SUPPRESSED, parts: out };
  }
  let hiddenCount = 0;
  let hiddenSum = 0;
  for (const k of keys) {
    out[k] = suppressCount(parts[k]);
    if (out[k] === SUPPRESSED) {
      hiddenCount += 1;
      hiddenSum += parts[k];
    }
  }
  while (hiddenCount >= 1 && hiddenSum < SUPPRESSION_THRESHOLD) {
    // Hide the smallest still-published component (first in declaration order on ties).
    let pick: K | undefined;
    for (const k of keys) {
      if (out[k] === SUPPRESSED) continue;
      if (pick === undefined || parts[k] < parts[pick]) pick = k;
    }
    if (pick === undefined) {
      // Nothing left to hide yet the hidden sum is still derivable and too small: suppress the total as well.
      return { total: SUPPRESSED, parts: out };
    }
    out[pick] = SUPPRESSED;
    hiddenCount += 1;
    hiddenSum += parts[pick];
  }
  return { total, parts: out };
}

/**
 * One CSV cell, safe against spreadsheet formula injection: a cell that starts with = + - @ tab or CR is neutralised
 * with a leading apostrophe, and quoting is applied when the value contains a comma, quote or line break.
 */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: ReadonlyArray<string | number>): string {
  return cells.map(csvCell).join(',');
}
