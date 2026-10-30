import type { PGlite } from '@electric-sql/pglite';
import type { StaffRole } from '@kalinga/shared';
import { hashPassword } from './password.js';

/**
 * DEV/TEST ONLY demo staff. Hashes are generated here at seed time (scrypt, per-user salt), so the repository holds no
 * password hash and no real e-mail address. Addresses use the reserved `.invalid` TLD. The shared DEMO password is
 * documented in docs/run-guide.md; override it with DEMO_STAFF_PASSWORD (min 12 characters). This function is only
 * reachable through seedDemoData, which refuses unless DEMO_MODE=true and NODE_ENV is development or test, and the
 * accounts are flagged is_demo so they cannot sign in when DEMO_MODE is off.
 */
export const DEMO_STAFF_PASSWORD_DEFAULT = 'demo-staff-only-2026';

interface DemoAccount {
  email: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  clinics: readonly string[];
}

export const DEMO_STAFF_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'staff.a@demo.invalid', displayName: 'DEMO Staff A', role: 'clinic_staff', active: true, clinics: ['demo-clinic-a'] },
  { email: 'staff.b@demo.invalid', displayName: 'DEMO Staff B', role: 'clinic_staff', active: true, clinics: ['demo-clinic-b'] },
  { email: 'admin.a@demo.invalid', displayName: 'DEMO Clinic Admin A', role: 'clinic_admin', active: true, clinics: ['demo-clinic-a'] },
  { email: 'provincial@demo.invalid', displayName: 'DEMO Provincial Admin', role: 'provincial_admin', active: true, clinics: [] },
  { email: 'tech@demo.invalid', displayName: 'DEMO Technical Admin', role: 'technical_admin', active: true, clinics: [] },
  { email: 'disabled@demo.invalid', displayName: 'DEMO Disabled Account', role: 'clinic_staff', active: false, clinics: ['demo-clinic-a'] },
];

/** Idempotent: existing accounts (matched by e-mail) are left untouched, including their password. */
export async function seedDemoStaff(db: PGlite, password?: string): Promise<string[]> {
  const pw = password ?? process.env.DEMO_STAFF_PASSWORD ?? DEMO_STAFF_PASSWORD_DEFAULT;
  if (pw.length < 12) throw new Error('DEMO_STAFF_PASSWORD must be at least 12 characters');
  const created: string[] = [];
  for (const a of DEMO_STAFF_ACCOUNTS) {
    const exists = await db.query<{ id: string }>('select id from staff_users where lower(email) = $1', [a.email]);
    if (exists.rows.length > 0) continue;
    const hash = await hashPassword(pw);
    await db.transaction(async (tx) => {
      const u = await tx.query<{ id: string }>(
        `insert into staff_users (email, display_name, password_hash, role, active, is_demo) values ($1, $2, $3, $4::staff_role, $5, true) returning id`,
        [a.email, a.displayName, hash, a.role, a.active],
      );
      const userId = u.rows[0]?.id;
      if (!userId) return;
      for (const slug of a.clinics) {
        await tx.query(
          `insert into clinic_memberships (user_id, clinic_id, role)
           select $1, c.id, $3::staff_role from clinics c where c.slug = $2 and c.is_demo on conflict do nothing`,
          [userId, slug, a.role],
        );
      }
    });
    created.push(a.email);
  }
  return created;
}
