import axe from 'axe-core';

/**
 * Runs axe-core on a rendered container (jsdom). Color-contrast is excluded because jsdom
 * does no layout or CSS cascade; contrast is covered by the token-pair test in a11y.test.tsx
 * and still needs a real-browser check.
 */
// jsdom has no canvas; axe probes it for color/icon checks and jsdom logs noise otherwise.
if (typeof HTMLCanvasElement !== 'undefined') HTMLCanvasElement.prototype.getContext = (() => null) as never;

export async function runAxe(container: Element): Promise<axe.Result[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations;
}

export function formatViolations(v: axe.Result[]): string {
  return v.map((x) => `${x.id}: ${x.help} (${x.nodes.map((n) => n.target.join(' ')).join(', ')})`).join('\n');
}
