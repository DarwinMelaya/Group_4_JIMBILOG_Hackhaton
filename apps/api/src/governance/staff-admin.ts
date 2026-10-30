import { randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  INVITE_TTL_HOURS,
  ROLE_RANK,
  StaffAdminUserSchema,
  canGrantRole,
  type InviteCreate,
  type InviteCreated,
  type InviteRedeem,
  type MembershipAssign,
  type StaffAdminUser,
  type StaffRole,
} from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { hashPassword } from '../staff/password.js';
import { sha256Hex } from '../staff/repository.js';
import { recordGovernanceAudit } from './audit.js';
import { forbidden, guarded, iso, notFound, type Queryable } from './common.js';

export interface Actor {
  id: string;
  role: StaffRole;
}

const notGrantable = (): AppError => new AppError(403, 'role_not_grantable', 'You cannot grant a role above your own authority.');
const selfModification = (): AppError => new AppError(409, 'cannot_modify_self', 'You cannot change your own role, membership or status.');
const inviteInvalid = (): AppError => new AppError(400, 'invite_invalid', 'This invitation is not valid.');

/** Clinic ids where the actor holds an ACTIVE clinic_admin membership (checked against the database on every call). */
export async function adminClinicIds(q: Queryable, actor: Actor): Promise<string[]> {
  const r = await q.query<{ clinic_id: string }>(
    `select m.clinic_id from clinic_memberships m join staff_users u on u.id = m.user_id
     where m.user_id = $1 and m.active and m.role = 'clinic_admin' and u.active and u.role in ('clinic_staff', 'clinic_admin')`,
    [actor.id],
  );
  return r.rows.map((x) => x.clinic_id);
}

/**
 * Resolves the clinic and authorises the actor for it. Provincial/technical admins see every clinic; a clinic admin sees
 * only clinics they administer. Everything else answers 404 so another clinic's existence is not revealed.
 */
async function authoriseClinic(q: Queryable, actor: Actor, clinicId: string): Promise<{ id: string }> {
  const c = await q.query<{ id: string }>('select id from clinics where id = $1', [clinicId]);
  const clinic = c.rows[0];
  if (!clinic) throw notFound();
  if (actor.role === 'clinic_admin' && !(await adminClinicIds(q, actor)).includes(clinicId)) throw notFound();
  if (actor.role === 'clinic_staff') throw forbidden();
  return clinic;
}

// ---- Invites -----------------------------------------------------------------------------------------------------

export async function createInvite(
  db: PGlite,
  actor: Actor,
  input: InviteCreate,
  demoMode: boolean,
  now: Date,
): Promise<InviteCreated> {
  // Mock delivery only: there is no e-mail transport, so outside DEMO/dev an invite could never reach its recipient.
  if (!demoMode) throw new AppError(501, 'invite_delivery_not_configured', 'Staff invitations are not available in this environment.');
  return guarded(() =>
    db.transaction(async (tx) => {
      if (input.clinicId) await authoriseClinic(tx, actor, input.clinicId);
      if (!canGrantRole(actor.role, input.role)) throw notGrantable();
      const exists = await tx.query('select 1 from staff_users where lower(email) = $1', [input.email]);
      if (exists.rows.length > 0) throw new AppError(409, 'account_exists', 'An account with this address already exists.');
      // 256-bit random code; only its SHA-256 is stored. The clear code is returned exactly once and never logged.
      const code = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000);
      const r = await tx.query<{ id: string }>(
        `insert into staff_invites (email, role, clinic_id, code_hash, created_by, created_at, expires_at)
         values ($1, $2::staff_role, $3, $4, $5, $6::timestamptz, $7::timestamptz) returning id`,
        [input.email, input.role, input.clinicId ?? null, sha256Hex(code), actor.id, now.toISOString(), expiresAt.toISOString()],
      );
      const id = r.rows[0]?.id ?? '';
      await recordGovernanceAudit(tx, {
        actorUserId: actor.id,
        action: 'governance.staff_invite_created',
        targetType: 'staff_invite',
        targetId: id,
        clinicId: input.clinicId ?? null,
        metadata: { role: input.role, outcome: 'created' },
        at: now,
      });
      return { id, email: input.email, role: input.role, clinicId: input.clinicId ?? null, expiresAt: expiresAt.toISOString(), inviteCode: code };
    }),
  );
}

interface InviteRow {
  id: string;
  email: string;
  role: StaffRole;
  clinic_id: string | null;
  expires_at: Date | string;
  used_at: Date | string | null;
  revoked_at: Date | string | null;
}

function inviteState(r: InviteRow, now: Date): 'pending' | 'used' | 'expired' | 'revoked' {
  if (r.used_at !== null) return 'used';
  if (r.revoked_at !== null) return 'revoked';
  return new Date(r.expires_at).getTime() <= now.getTime() ? 'expired' : 'pending';
}

export async function listInvites(db: PGlite, actor: Actor, now: Date) {
  const scope = actor.role === 'clinic_admin' ? await adminClinicIds(db, actor) : null;
  const r = await db.query<InviteRow>(
    `select id, email, role, clinic_id, expires_at, used_at, revoked_at from staff_invites
     where ($1::uuid[] is null or clinic_id = any($1::uuid[])) order by created_at desc, id limit 200`,
    [scope],
  );
  return r.rows.map((i) => ({ id: i.id, email: i.email, role: i.role, clinicId: i.clinic_id, expiresAt: iso(i.expires_at) ?? '', state: inviteState(i, now) }));
}

export async function revokeInvite(db: PGlite, actor: Actor, inviteId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const r = await tx.query<InviteRow>(`select id, email, role, clinic_id, expires_at, used_at, revoked_at from staff_invites where id = $1 for update`, [inviteId]);
    const inv = r.rows[0];
    if (!inv) throw notFound();
    if (actor.role === 'clinic_admin' && !(inv.clinic_id !== null && (await adminClinicIds(tx, actor)).includes(inv.clinic_id))) throw notFound();
    if (inviteState(inv, now) !== 'pending') throw new AppError(409, 'invite_not_pending', 'Only a pending invitation can be revoked.');
    await tx.query('update staff_invites set revoked_at = $2::timestamptz where id = $1', [inviteId, now.toISOString()]);
    await recordGovernanceAudit(tx, {
      actorUserId: actor.id,
      action: 'governance.staff_invite_revoked',
      targetType: 'staff_invite',
      targetId: inviteId,
      clinicId: inv.clinic_id,
      metadata: { role: inv.role, outcome: 'revoked' },
      at: now,
    });
  });
}

/**
 * Public (session-less) redemption. One generic failure for unknown, used, revoked, expired or mismatched invitations.
 * The invite is consumed atomically (`used_at is null` guard inside the same transaction that creates the account), so
 * two parallel redemptions cannot both succeed.
 */
export async function redeemInvite(db: PGlite, input: InviteRedeem, now: Date): Promise<{ userId: string }> {
  const codeHash = sha256Hex(input.code);
  const pre = await db.query<InviteRow>(`select id, email, role, clinic_id, expires_at, used_at, revoked_at from staff_invites where code_hash = $1`, [codeHash]);
  const probe = pre.rows[0];
  if (!probe || probe.email !== input.email || inviteState(probe, now) !== 'pending') throw inviteInvalid();
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const consumed = await tx.query<InviteRow>(
        `update staff_invites set used_at = $2::timestamptz
         where code_hash = $1 and used_at is null and revoked_at is null and expires_at > $2::timestamptz and email = $3
         returning id, email, role, clinic_id, expires_at, used_at, revoked_at`,
        [codeHash, now.toISOString(), input.email],
      );
      const inv = consumed.rows[0];
      if (!inv) throw inviteInvalid();
      const u = await tx.query<{ id: string }>(
        `insert into staff_users (email, display_name, password_hash, role, active, is_demo)
         values ($1, $2, $3, $4::staff_role, true, $5) returning id`,
        [inv.email, input.displayName, passwordHash, inv.role, inv.email.endsWith('@demo.invalid')],
      );
      const userId = u.rows[0]?.id ?? '';
      await tx.query('update staff_invites set used_by = $2 where id = $1', [inv.id, userId]);
      if (inv.clinic_id) {
        await tx.query(`insert into clinic_memberships (user_id, clinic_id, role) values ($1, $2, $3::staff_role)`, [userId, inv.clinic_id, inv.role]);
      }
      await recordGovernanceAudit(tx, {
        actorUserId: userId,
        action: 'governance.staff_invite_redeemed',
        targetType: 'staff_invite',
        targetId: inv.id,
        clinicId: inv.clinic_id,
        metadata: { role: inv.role, outcome: 'redeemed' },
        at: now,
      });
      return { userId };
    });
  } catch (err) {
    // A unique violation (account created in the meantime) is the same generic failure, never a distinct signal.
    if (err instanceof AppError) throw err;
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) throw inviteInvalid();
    throw err;
  }
}

// ---- Listing, memberships, deactivation ---------------------------------------------------------------------------

interface StaffListRow {
  id: string;
  email: string;
  display_name: string;
  role: StaffRole;
  active: boolean;
  is_demo: boolean;
  m_clinic_id: string | null;
  m_clinic_slug: string | null;
  m_role: 'clinic_staff' | 'clinic_admin' | null;
  m_active: boolean | null;
}

export async function listStaff(db: PGlite, actor: Actor): Promise<StaffAdminUser[]> {
  const scope = actor.role === 'clinic_admin' ? await adminClinicIds(db, actor) : null;
  // A clinic admin sees only people with a membership in a clinic they administer, and only those memberships.
  const r = await db.query<StaffListRow>(
    `select u.id, u.email, u.display_name, u.role, u.active, u.is_demo,
            m.clinic_id as m_clinic_id, c.slug as m_clinic_slug, m.role as m_role, m.active as m_active
     from staff_users u
     left join clinic_memberships m on m.user_id = u.id
     left join clinics c on c.id = m.clinic_id
     where ($1::uuid[] is null or m.clinic_id = any($1::uuid[]))
     order by u.email, c.slug limit 1000`,
    [scope],
  );
  const byUser = new Map<string, StaffAdminUser>();
  for (const row of r.rows) {
    let u = byUser.get(row.id);
    if (!u) {
      u = StaffAdminUserSchema.parse({ id: row.id, email: row.email, displayName: row.display_name, role: row.role, active: row.active, isDemo: row.is_demo, memberships: [] });
      byUser.set(row.id, u);
    }
    if (row.m_clinic_id && row.m_clinic_slug && row.m_role && row.m_active !== null) {
      u.memberships.push({ clinicId: row.m_clinic_id, clinicSlug: row.m_clinic_slug, role: row.m_role, active: row.m_active });
    }
  }
  return [...byUser.values()];
}

interface TargetUser {
  id: string;
  role: StaffRole;
  active: boolean;
}

async function loadTarget(tx: Queryable, userId: string): Promise<TargetUser> {
  const r = await tx.query<TargetUser>('select id, role, active from staff_users where id = $1 for update', [userId]);
  const t = r.rows[0];
  if (!t) throw notFound();
  return t;
}

/** Shared by assign/remove: scope, visibility and rank checks for a clinic-level target. */
async function authoriseMembershipChange(tx: Queryable, actor: Actor, target: TargetUser, clinicId: string): Promise<{ existingRole: StaffRole | null }> {
  if (target.id === actor.id) throw selfModification();
  await authoriseClinic(tx, actor, clinicId);
  const existing = await tx.query<{ role: StaffRole }>('select role from clinic_memberships where user_id = $1 and clinic_id = $2', [target.id, clinicId]);
  const existingRole = existing.rows[0]?.role ?? null;
  // A clinic admin can only manage people who already belong to their clinic (no probing or poaching by user id).
  if (actor.role === 'clinic_admin' && existingRole === null) throw notFound();
  // Provincial/technical accounts carry no clinic membership (separation of duty: no booking access).
  if (target.role !== 'clinic_staff' && target.role !== 'clinic_admin') {
    throw new AppError(409, 'membership_not_applicable', 'Provincial and technical administrators do not hold clinic memberships.');
  }
  // Nobody manages a person who currently holds a role above what they may grant (a clinic admin cannot touch a peer admin).
  if (existingRole !== null && !canGrantRole(actor.role, existingRole)) throw forbidden();
  return { existingRole };
}

export async function assignMembership(db: PGlite, actor: Actor, userId: string, input: MembershipAssign, now: Date): Promise<void> {
  await guarded(() =>
    db.transaction(async (tx) => {
      const target = await loadTarget(tx, userId);
      await authoriseMembershipChange(tx, actor, target, input.clinicId);
      if (!canGrantRole(actor.role, input.role)) throw notGrantable();
      if (!target.active) throw new AppError(409, 'user_inactive', 'This account is deactivated.');
      const r = await tx.query<{ id: string }>(
        `insert into clinic_memberships (user_id, clinic_id, role, active) values ($1, $2, $3::staff_role, true)
         on conflict (user_id, clinic_id) do update set role = excluded.role, active = true returning id`,
        [userId, input.clinicId, input.role],
      );
      await recordGovernanceAudit(tx, {
        actorUserId: actor.id,
        action: 'governance.staff_membership_set',
        targetType: 'staff_membership',
        targetId: r.rows[0]?.id ?? userId,
        clinicId: input.clinicId,
        metadata: { role: input.role, outcome: 'set' },
        at: now,
      });
    }),
  );
}

export async function removeMembership(db: PGlite, actor: Actor, userId: string, clinicId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await loadTarget(tx, userId);
    const { existingRole } = await authoriseMembershipChange(tx, actor, target, clinicId);
    if (existingRole === null) throw notFound();
    const r = await tx.query<{ id: string }>('update clinic_memberships set active = false where user_id = $1 and clinic_id = $2 returning id', [userId, clinicId]);
    await recordGovernanceAudit(tx, {
      actorUserId: actor.id,
      action: 'governance.staff_membership_removed',
      targetType: 'staff_membership',
      targetId: r.rows[0]?.id ?? userId,
      clinicId,
      metadata: { role: existingRole, outcome: 'deactivated' },
      at: now,
    });
  });
}

/**
 * Deactivates an account and revokes all its sessions. Only provincial/technical admins reach this. Rank rule: you cannot
 * deactivate someone above your own authority. Last-admin rule: the last active technical_admin and the last active
 * provincial_admin can never be deactivated.
 */
export async function deactivateUser(db: PGlite, actor: Actor, userId: string, now: Date): Promise<{ sessionsRevoked: number }> {
  return db.transaction(async (tx) => {
    const target = await loadTarget(tx, userId);
    if (target.id === actor.id) throw selfModification();
    if (ROLE_RANK[target.role] > ROLE_RANK[actor.role]) throw forbidden();
    if (!target.active) throw new AppError(409, 'already_inactive', 'This account is already deactivated.');
    if (target.role === 'technical_admin' || target.role === 'provincial_admin') {
      const others = await tx.query<{ id: string }>('select id from staff_users where role = $1::staff_role and active and id <> $2 for update', [target.role, target.id]);
      if (others.rows.length === 0) throw new AppError(409, 'last_admin', 'The last active administrator of this kind cannot be deactivated.');
    }
    await tx.query('update staff_users set active = false, updated_at = $2::timestamptz where id = $1', [userId, now.toISOString()]);
    const revoked = await tx.query<{ id: string }>('update staff_sessions set revoked_at = $2::timestamptz where user_id = $1 and revoked_at is null returning id', [userId, now.toISOString()]);
    await recordGovernanceAudit(tx, {
      actorUserId: actor.id,
      action: 'governance.staff_user_deactivated',
      targetType: 'staff_user',
      targetId: userId,
      metadata: { role: target.role, count: revoked.rows.length, outcome: 'deactivated' },
      at: now,
    });
    return { sessionsRevoked: revoked.rows.length };
  });
}
