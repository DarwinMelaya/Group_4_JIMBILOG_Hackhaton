import { describe, expect, it } from 'vitest';
import { LOCALES, REQUEST_STATUSES } from './index';

describe('shared enums', () => {
  it('exposes the two public locales', () => {
    expect(LOCALES).toEqual(['en', 'fil']);
  });
  it('limits public request statuses', () => {
    expect(REQUEST_STATUSES).toHaveLength(4);
  });
});
