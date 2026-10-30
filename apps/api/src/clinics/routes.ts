import express from 'express';
import type { PGlite } from '@electric-sql/pglite';
import { ClinicIdParamSchema, ClinicListQuerySchema } from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { getClinic, listClinics } from './repository.js';

/** Public, read-only. Short-lived cacheable; errors keep the no-store envelope. */
const CACHE = 'public, max-age=60';

export function clinicsRouter(demoMode: boolean, getDb: () => PGlite | undefined): express.Router {
  const router = express.Router();
  const db = (): PGlite => {
    const d = getDb();
    if (!d) throw new AppError(503, 'service_unavailable', 'This service is temporarily unavailable.');
    return d;
  };

  router.get('/public/clinics', async (req, res) => {
    const query = ClinicListQuerySchema.parse(req.query);
    const body = await listClinics(db(), demoMode, query);
    res.setHeader('Cache-Control', CACHE);
    res.json(body);
  });

  router.get('/public/clinics/:id', async (req, res) => {
    const id = ClinicIdParamSchema.safeParse(req.params.id);
    if (!id.success) throw new AppError(404, 'not_found', 'Not found.');
    const clinic = await getClinic(db(), demoMode, id.data);
    if (!clinic) throw new AppError(404, 'not_found', 'Not found.');
    res.setHeader('Cache-Control', CACHE);
    res.json(clinic);
  });

  return router;
}
