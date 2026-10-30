import { z } from 'zod';
import { API_BASE, ApiRequestError, httpError } from './client';

/**
 * Admin aggregate report fetch layer (S8-2). Counts only: a cell is a whole number or the string "<5" (small-cell
 * suppression is done by the API). Same rules as ./admin: cookie session, `cache: 'no-store'`, nothing stored in the browser.
 */
const Cell = z.union([z.number().int().nonnegative(), z.literal('<5')]);

export const ReportSummarySchema = z.object({
  generatedAt: z.string(),
  scope: z.enum(['all', 'clinic']),
  suppressionThreshold: z.number().int(),
  periods: z.array(
    z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      received: Cell,
      awaiting: Cell,
      confirmed: Cell,
      alternative: Cell,
      cancelled: Cell,
      expired: Cell,
    }),
  ),
  attendance: z.object({ status: z.literal('not_collected') }).optional(),
  caveats: z.array(z.string()),
});
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

async function get(path: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/admin${path}`, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal });
  } catch {
    throw new ApiRequestError('network');
  }
  if (!res.ok) throw await httpError(res);
  return res;
}

export async function getReportSummary(months: number, signal?: AbortSignal): Promise<ReportSummary> {
  const res = await get(`/reports/summary?months=${months}`, signal);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError('invalid-response');
  }
  const parsed = ReportSummarySchema.safeParse(json);
  if (!parsed.success) throw new ApiRequestError('invalid-response');
  return parsed.data;
}

export async function getReportCsv(months: number, signal?: AbortSignal): Promise<string> {
  return (await get(`/reports/export.csv?months=${months}`, signal)).text();
}
