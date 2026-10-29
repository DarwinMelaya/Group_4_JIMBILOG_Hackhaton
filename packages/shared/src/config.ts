import { z } from 'zod';
import { LOCALES } from './locales.js';

/** Response contract for GET /api/v1/public/config. Only server-enforced, non-secret values. */
export const PublicConfigSchema = z
  .object({
    apiVersion: z.literal('v1'),
    demoMode: z.boolean(),
    locales: z.array(z.enum(LOCALES)).min(1),
    defaultLocale: z.enum(LOCALES),
    timezone: z.literal('Asia/Manila'),
    notificationTransport: z.literal('mock'),
    realBookingEnabled: z.literal(false),
    clinicalContentApproved: z.boolean(),
  })
  .strict();
export type PublicConfig = z.infer<typeof PublicConfigSchema>;

/** Stable error envelope returned by the API. */
export const ApiErrorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }).strict(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;
