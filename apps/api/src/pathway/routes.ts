import express from 'express';
import type { PGlite } from '@electric-sql/pglite';
import { PathwayMatchRequestSchema } from '@kalinga/shared';
import { listPublishedClinicDetails } from '../clinics/repository.js';
import { AppError } from '../http/errors.js';
import { URGENT_GUIDANCE, matchClinics } from './match.js';

/**
 * POST /api/v1/public/pathway/match. Stateless: the body is validated, used for this one response and dropped. It is
 * never written to the database, never logged (the access log records method/path/status only and the error handler
 * logs only an error class), and the response is never cached.
 */
export function pathwayRouter(demoMode: boolean, getDb: () => PGlite | undefined): express.Router {
  const router = express.Router();

  router.post('/public/pathway/match', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = PathwayMatchRequestSchema.parse(req.body ?? {});
    // Urgent bypass: no ranking and no database access at all. Guidance only; nothing about the choice is kept.
    if (body.urgentExposureWithin72h === true) {
      res.json(URGENT_GUIDANCE);
      return;
    }
    const db = getDb();
    if (!db) throw new AppError(503, 'service_unavailable', 'This service is temporarily unavailable.');
    const clinics = await listPublishedClinicDetails(db, demoMode, body.municipality);
    res.json(matchClinics(clinics, body));
  });

  return router;
}
