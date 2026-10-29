import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('creates an express app with x-powered-by disabled', () => {
    const app = createApp();
    expect(app.get('x-powered-by')).toBe(false);
  });
});
