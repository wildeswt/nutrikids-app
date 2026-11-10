import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;

describe('Database Immutability, Roles, Business Rules and RLS', () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  interface SeedResult {
    caregiverUserId: string;
    professionalUserId: string;
    unrelatedUserId: string;
    childId: string;
    checkupId: string;
    indicatorResultId: string;
    alertId: string;
    alertHistoryId: string;
    auditLogId: string;
  }

  async function seed(): Promise<SeedResult> {
    const caregiverUserId = crypto.randomUUID();
    const professionalUserId = crypto.randomUUID();
    const unrelatedUserId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const checkupId = crypto.randomUUID();
    const indicatorResultId = crypto.randomUUID();
    const alertId = crypto.randomUUID();
    const alertHistoryId = crypto.randomUUID();
    const auditLogId = crypto.randomUUID();

    // 1. Users
    await client.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES
         ($1, 'caregiver@example.com', 'hash1', 'Caregiver', 'One', 'active', now()),
         ($2, 'professional@example.com', 'hash2', 'Doctor', 'Two', 'active', now()),
         ($3, 'unrelated@example.com', 'hash3', 'Other', 'Three', 'active', now())`,
      [caregiverUserId, professionalUserId, unrelatedUserId],
    );

    // 2. Roles
    await client.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, '+584120000000')`, [
      caregiverUserId,
    ]);

    await client.query(
      `INSERT INTO professionals (user_id, specialty, license_number)
       VALUES ($1, 'pediatrics', 'MED-12345')`,
      [professionalUserId],
    );

    // 3. Child (born 2023-05-10)
    await client.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, 'Ana', 'Gomez', '2023-05-10', 'FEMALE')`,
      [childId],
    );

    // 4. Caregiver-child link
    await client.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'mother', true)`,
      [caregiverUserId, childId],
    );

    // 5. Active professional assignment
    await client.query(
      `INSERT INTO professional_children (id, child_id, professional_id, start_date, end_date)
       VALUES ($1, $2, $3, CURRENT_DATE - 1, CURRENT_DATE + 30)`,
      [crypto.randomUUID(), childId, professionalUserId],
    );

    // 6. Checkup
    await client.query(
      `INSERT INTO checkups (id, child_id, measured_at, weight_kg, length_height_cm, position, origin, recorded_by_id)
       VALUES ($1, $2, '2024-01-15 10:00:00-04', 11.20, 82.5, 'STANDING', 'CAREGIVER', $3)`,
      [checkupId, childId, caregiverUserId],
    );

    // 7. Indicator result
    await client.query(
      `INSERT INTO indicator_results (id, checkup_id, indicator, z_score, percentile, classification, reference_version)
       VALUES ($1, $2, 'WEIGHT_FOR_AGE', -0.50, 30.85, 'normal', 'WHO 2006')`,
      [indicatorResultId, checkupId],
    );

    // 8. Alert
    await client.query(
      `INSERT INTO alerts (id, indicator_result_id, risk_type, is_severe, status)
       VALUES ($1, $2, 'UNDERWEIGHT', false, 'GENERATED')`,
      [alertId, indicatorResultId],
    );

    // 9. Alert history
    await client.query(
      `INSERT INTO alert_history (id, alert_id, status, changed_by_id)
       VALUES ($1, $2, 'GENERATED', $3)`,
      [alertHistoryId, alertId, caregiverUserId],
    );

    // 10. Audit log
    await client.query(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id)
       VALUES ($1, $2, 'CREATE', 'checkups', $3)`,
      [auditLogId, caregiverUserId, checkupId],
    );

    return {
      caregiverUserId,
      professionalUserId,
      unrelatedUserId,
      childId,
      checkupId,
      indicatorResultId,
      alertId,
      alertHistoryId,
      auditLogId,
    };
  }

  describe('Part A: Immutability triggers (even for database owner)', () => {
    it('UPDATE on checkups is rejected by forbid_mutation trigger', async () => {
      const { checkupId } = await seed();
      await expect(
        client.query(`UPDATE checkups SET weight_kg = 15.0 WHERE id = $1`, [checkupId]),
      ).rejects.toThrow(/checkups is immutable: UPDATE not allowed/i);
    });

    it('DELETE on checkups is rejected by forbid_mutation trigger', async () => {
      const { checkupId } = await seed();
      await expect(client.query(`DELETE FROM checkups WHERE id = $1`, [checkupId])).rejects.toThrow(
        /checkups is immutable: DELETE not allowed/i,
      );
    });

    it('UPDATE on alert_history is rejected by forbid_mutation trigger', async () => {
      const { alertHistoryId } = await seed();
      await expect(
        client.query(`UPDATE alert_history SET status = 'REVIEWED' WHERE id = $1`, [
          alertHistoryId,
        ]),
      ).rejects.toThrow(/alert_history is immutable: UPDATE not allowed/i);
    });

    it('DELETE on alert_history is rejected by forbid_mutation trigger', async () => {
      const { alertHistoryId } = await seed();
      await expect(
        client.query(`DELETE FROM alert_history WHERE id = $1`, [alertHistoryId]),
      ).rejects.toThrow(/alert_history is immutable: DELETE not allowed/i);
    });

    it('UPDATE on audit_logs is rejected by forbid_mutation trigger', async () => {
      const { auditLogId } = await seed();
      await expect(
        client.query(`UPDATE audit_logs SET action = 'TAMPERED' WHERE id = $1`, [auditLogId]),
      ).rejects.toThrow(/audit_logs is immutable: UPDATE not allowed/i);
    });

    it('DELETE on audit_logs is rejected by forbid_mutation trigger', async () => {
      const { auditLogId } = await seed();
      await expect(
        client.query(`DELETE FROM audit_logs WHERE id = $1`, [auditLogId]),
      ).rejects.toThrow(/audit_logs is immutable: DELETE not allowed/i);
    });
  });

  describe('Part B: nutrikids_app role permissions', () => {
    it('nutrikids_app has no UPDATE privilege on checkups', async () => {
      const { checkupId } = await seed();
      await client.query('SET LOCAL ROLE nutrikids_app');
      await expect(
        client.query(`UPDATE checkups SET weight_kg = 15.0 WHERE id = $1`, [checkupId]),
      ).rejects.toThrow(/permission denied/i);
    });

    it('nutrikids_app has no DELETE privilege on checkups', async () => {
      const { checkupId } = await seed();
      await client.query('SET LOCAL ROLE nutrikids_app');
      await expect(client.query(`DELETE FROM checkups WHERE id = $1`, [checkupId])).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('nutrikids_app has no UPDATE privilege on alert_history', async () => {
      const { alertHistoryId } = await seed();
      await client.query('SET LOCAL ROLE nutrikids_app');
      await expect(
        client.query(`UPDATE alert_history SET status = 'REVIEWED' WHERE id = $1`, [
          alertHistoryId,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });

    it('nutrikids_app has no DELETE privilege on alert_history', async () => {
      const { alertHistoryId } = await seed();
      await client.query('SET LOCAL ROLE nutrikids_app');
      await expect(
        client.query(`DELETE FROM alert_history WHERE id = $1`, [alertHistoryId]),
      ).rejects.toThrow(/permission denied/i);
    });

    it('nutrikids_app has no UPDATE privilege on audit_logs', async () => {
      const { auditLogId } = await seed();
      await client.query('SET LOCAL ROLE nutrikids_app');
      await expect(
        client.query(`UPDATE audit_logs SET action = 'UPDATE' WHERE id = $1`, [auditLogId]),
      ).rejects.toThrow(/permission denied/i);
    });

    it('nutrikids_app has no DELETE privilege on audit_logs', async () => {
      const { auditLogId } = await seed();
      await client.query('SET LOCAL ROLE nutrikids_app');
      await expect(
        client.query(`DELETE FROM audit_logs WHERE id = $1`, [auditLogId]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe('Part C: Business rules triggers', () => {
    it('rejects checkup date preceding child birth date', async () => {
      const { childId, caregiverUserId } = await seed();
      const invalidCheckupId = crypto.randomUUID();

      // Child was born 2023-05-10; checkup on 2022-12-01 should be rejected
      await expect(
        client.query(
          `INSERT INTO checkups (id, child_id, measured_at, weight_kg, length_height_cm, position, origin, recorded_by_id)
           VALUES ($1, $2, '2022-12-01 10:00:00-04', 8.0, 70.0, 'RECUMBENT', 'CAREGIVER', $3)`,
          [invalidCheckupId, childId, caregiverUserId],
        ),
      ).rejects.toThrow(/measured_at precedes the child's birth date/i);
    });

    it('rejects transitioning alert to FOLLOW_UP_ESTABLISHED without existing follow_up', async () => {
      const { alertId } = await seed();

      await expect(
        client.query(`UPDATE alerts SET status = 'FOLLOW_UP_ESTABLISHED' WHERE id = $1`, [alertId]),
      ).rejects.toThrow(/needs a follow-up first/i);
    });

    it('accepts transitioning alert to FOLLOW_UP_ESTABLISHED when a follow_up exists', async () => {
      const { alertId, childId, professionalUserId } = await seed();
      const followUpId = crypto.randomUUID();

      // First create follow_up referencing the alert
      await client.query(
        `INSERT INTO follow_ups (id, child_id, alert_id, professional_id, type, details, next_checkup_date)
         VALUES ($1, $2, $3, $4, 'observation', 'Scheduled follow-up for underweight assessment', CURRENT_DATE + 14)`,
        [followUpId, childId, alertId, professionalUserId],
      );

      // Now transitioning the alert should succeed
      const res = await client.query(
        `UPDATE alerts SET status = 'FOLLOW_UP_ESTABLISHED' WHERE id = $1 RETURNING status`,
        [alertId],
      );
      expect(res.rows[0].status).toBe('FOLLOW_UP_ESTABLISHED');
    });
  });

  describe('Part D: Row Level Security (RLS) policies', () => {
    it('returns zero rows on child-scoped tables when app.user_id is not set (fail-closed)', async () => {
      await seed();

      await client.query('SET LOCAL ROLE nutrikids_app');
      // No app.user_id set in session

      const res = await client.query(`SELECT COUNT(*)::int AS count FROM checkups`);
      expect(res.rows[0].count).toBe(0);

      const childrenRes = await client.query(`SELECT COUNT(*)::int AS count FROM children`);
      expect(childrenRes.rows[0].count).toBe(0);
    });

    it('allows linked caregiver to view child checkups', async () => {
      const { caregiverUserId } = await seed();

      await client.query('SET LOCAL ROLE nutrikids_app');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [caregiverUserId]);

      const res = await client.query(`SELECT COUNT(*)::int AS count FROM checkups`);
      expect(res.rows[0].count).toBe(1);
    });

    it('denies access to an unrelated user with no child linkage', async () => {
      const { unrelatedUserId } = await seed();

      await client.query('SET LOCAL ROLE nutrikids_app');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [unrelatedUserId]);

      const res = await client.query(`SELECT COUNT(*)::int AS count FROM checkups`);
      expect(res.rows[0].count).toBe(0);
    });

    it('denies professional access if assignment end_date has expired', async () => {
      const { childId, professionalUserId } = await seed();

      // Expire professional assignment by setting end_date to yesterday
      await client.query(
        `UPDATE professional_children
         SET end_date = CURRENT_DATE - 1
         WHERE child_id = $1 AND professional_id = $2`,
        [childId, professionalUserId],
      );

      await client.query('SET LOCAL ROLE nutrikids_app');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [professionalUserId]);

      const res = await client.query(`SELECT COUNT(*)::int AS count FROM checkups`);
      expect(res.rows[0].count).toBe(0);
    });

    it('propagates RLS to indirect tables (indicator_results and alerts)', async () => {
      const { caregiverUserId, unrelatedUserId } = await seed();

      await client.query('SET LOCAL ROLE nutrikids_app');

      // Caregiver sees indicator_results and alerts via checkup
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [caregiverUserId]);
      const irCaregiver = await client.query(
        `SELECT COUNT(*)::int AS count FROM indicator_results`,
      );
      expect(irCaregiver.rows[0].count).toBe(1);

      const alertsCaregiver = await client.query(`SELECT COUNT(*)::int AS count FROM alerts`);
      expect(alertsCaregiver.rows[0].count).toBe(1);

      // Unrelated user sees 0 rows in indirect tables
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [unrelatedUserId]);
      const irUnrelated = await client.query(
        `SELECT COUNT(*)::int AS count FROM indicator_results`,
      );
      expect(irUnrelated.rows[0].count).toBe(0);

      const alertsUnrelated = await client.query(`SELECT COUNT(*)::int AS count FROM alerts`);
      expect(alertsUnrelated.rows[0].count).toBe(0);
    });
  });
});
