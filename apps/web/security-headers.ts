/** Pure helpers shared by vite.config.ts and tests. The single source of truth for the production
 *  security headers is public/_headers (Netlify / Cloudflare Pages format); this file only parses it and
 *  derives the dev-server variant, so the two cannot drift apart. */

export interface HeaderRule {
  path: string;
  headers: Record<string, string>;
}

/** Parses `_headers` text: an unindented line starts a rule (a path), indented `Name: value` lines belong
 *  to it, `#` lines and blank lines are ignored. */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | undefined;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { path: raw.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    const line = raw.trim();
    const i = line.indexOf(':');
    if (!current || i < 1) throw new Error(`Malformed _headers line: ${raw}`);
    current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}

/** Headers of the catch-all `/*` rule: what every response of the site carries. */
export function globalHeaders(rules: HeaderRule[]): Record<string, string> {
  const rule = rules.find((r) => r.path === '/*');
  if (!rule) throw new Error('_headers has no /* rule');
  return { ...rule.headers };
}

/** Relaxed CSP for `vite dev` ONLY. Vite's React refresh preamble is an inline module script, HMR injects
 *  <style> elements, and HMR runs over a WebSocket. Every other directive stays as strict as production. */
export function devCsp(prodCsp: string): string {
  return prodCsp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      if (d.startsWith('script-src ') || d.startsWith('style-src ')) return `${d} 'unsafe-inline'`;
      if (d.startsWith('connect-src ')) return `${d} ws://localhost:* ws://127.0.0.1:*`;
      return d;
    })
    .join('; ');
}

export function devHeaders(prod: Record<string, string>): Record<string, string> {
  return { ...prod, 'Content-Security-Policy': devCsp(prod['Content-Security-Policy'] ?? '') };
}
