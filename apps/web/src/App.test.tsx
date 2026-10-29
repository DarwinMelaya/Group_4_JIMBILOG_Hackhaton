import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App';

describe('App', () => {
  it('renders the DEMO label', () => {
    expect(renderToString(<App />)).toContain('KALINGA (DEMO)');
  });
});
