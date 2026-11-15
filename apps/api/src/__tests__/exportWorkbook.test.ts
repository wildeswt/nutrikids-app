import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { encryptPii } from '../lib/pii-crypto.js';
import { prisma } from '../lib/prisma.js';
import { describeAge, splitFeedingDetails } from '../services/exportWorkbook.service.js';
import { signAccessToken } from '../services/token.service.js';

describe('Exportación del historial a Excel', { timeout: 60000 }, () => {
  const app = createApp();
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL });
    await admin.connect();
  });

  afterAll(async () => {
    await admin?.end();
    await prisma.$disconnect();
  });

  async function createCaregiver() {
    const userId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, status, updated_at)
       VALUES ($1, $2, 'secret-hash', $3, $4, 'active', now())`,
      [
        userId,
        `xlsx-${userId}@nutrikids.local`,
        encryptPii('Ana', 'users:first_name'),
        encryptPii('Rivera', 'users:last_name'),
      ],
    );
    await admin.query(`INSERT INTO caregivers (user_id, phone) VALUES ($1, $2)`, [
      userId,
      encryptPii('+593990000', 'caregivers:phone'),
    ]);
    const { accessToken } = await signAccessToken({
      sub: userId,
      roles: ['CAREGIVER'],
      specialty: null,
    });
    return { userId, auth: `Bearer ${accessToken}` };
  }

  async function seed(rep: { userId: string }, legal: boolean) {
    const childId = crypto.randomUUID();
    await admin.query(
      `INSERT INTO children (id, first_name, last_name, birth_date, sex)
       VALUES ($1, $2, $3, CURRENT_DATE - 700, 'FEMALE')`,
      [
        childId,
        encryptPii('Luna', 'children:first_name'),
        encryptPii('Prueba', 'children:last_name'),
      ],
    );
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Madre', $3)`,
      [rep.userId, childId, legal],
    );
    await admin.query(
      `INSERT INTO consents (id, child_id, caregiver_id, text_version) VALUES ($1, $2, $3, 'v1')`,
      [crypto.randomUUID(), childId, rep.userId],
    );
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const corrected = crypto.randomUUID();
    for (const [id, days, weight, height, corrects] of [
      [first, 60, '10.00', '79.0', null],
      [second, 30, '10.40', '80.0', null],
      [corrected, 29, '10.60', '80.0', second],
    ] as const) {
      await admin.query(
        `INSERT INTO checkups (id, child_id, measured_at, weight_kg, length_height_cm, position,
                               origin, recorded_by_id, corrected_checkup_id, notes)
         VALUES ($1, $2, now() - ($3 || ' days')::interval, $4, $5, 'RECUMBENT', 'CAREGIVER', $6, $7,
                 $8)`,
        [id, childId, String(days), weight, height, rep.userId, corrects, 'Control con nota'],
      );
    }
    await admin.query(
      `INSERT INTO feeding_logs (id, child_id, log_date, meals_per_day, details)
       VALUES ($1, $2, CURRENT_DATE - 1, 3, 'Comidas: Desayuno, Almuerzo, Cena. Sopa de verduras')`,
      [crypto.randomUUID(), childId],
    );
    return childId;
  }

  const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  };

  it('GET /children/:id/export.xlsx devuelve un libro con hojas y datos claros', async () => {
    const rep = await createCaregiver();
    const childId = await seed(rep, true);

    const res = await request(app)
      .get(`/children/${childId}/export.xlsx`)
      .set('Authorization', rep.auth)
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="nutrikids-historial-luna-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumen',
      'Controles',
      'Alimentación',
      'Permisos',
    ]);

    const summary = wb.getWorksheet('Resumen')!;
    expect(summary.getCell('A1').value).toBe('NutriKids · Historial de crecimiento');
    expect(summary.getCell('A2').value).toBe('Luna Prueba');
    const summaryText = JSON.stringify(summary.getSheetValues());
    expect(summaryText).toContain('Ana Rivera');
    expect(summaryText).toContain('Niña');

    const checkups = wb.getWorksheet('Controles')!;
    const header = (checkups.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual([
      'Fecha',
      'Edad',
      'Peso (kg)',
      'Estatura (cm)',
      'IMC (kg/m²)',
      'Cambio de peso (kg)',
      'Cambio de estatura (cm)',
      'Cómo se midió',
      'Registrado por',
      'Estado',
      'Notas',
    ]);
    // 3 filas, de la más antigua a la más reciente; la del medio fue reemplazada por la corrección.
    expect(checkups.rowCount).toBe(4);
    expect(checkups.getRow(2).getCell(3).value).toBe(10);
    expect(checkups.getRow(3).getCell(10).value).toBe('Reemplazado por una corrección');
    expect(checkups.getRow(4).getCell(10).value).toBe('Vigente (corregido)');
    // El cambio de peso se calcula entre controles vigentes: 10,60 - 10,00.
    expect(checkups.getRow(4).getCell(6).value).toBeCloseTo(0.6);
    expect(checkups.getRow(2).getCell(8).value).toBe('Acostado');
    expect(checkups.getRow(2).getCell(9).value).toBe('Ana Rivera');
    // Sin puntajes técnicos (RF-14).
    expect(JSON.stringify(checkups.getSheetValues())).not.toMatch(/z-?score|percentil/i);

    const feeding = wb.getWorksheet('Alimentación')!;
    expect(feeding.getRow(2).getCell(2).value).toBe(3);
    expect(feeding.getRow(2).getCell(3).value).toBe('Desayuno, Almuerzo, Cena');
    expect(feeding.getRow(2).getCell(4).value).toBe('Sopa de verduras');

    const permisos = wb.getWorksheet('Permisos')!;
    expect((permisos.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Aceptado el',
      'Retirado el',
      'Estado',
    ]);
    expect(permisos.getRow(2).getCell(3).value).toBe('Vigente');
  });

  it('solo el representante legal puede descargarlo (403)', async () => {
    const rep = await createCaregiver();
    const other = await createCaregiver();
    const childId = await seed(rep, true);
    await admin.query(
      `INSERT INTO caregiver_children (caregiver_id, child_id, relationship, is_legal_representative)
       VALUES ($1, $2, 'Tío', false)`,
      [other.userId, childId],
    );

    const res = await request(app)
      .get(`/children/${childId}/export.xlsx`)
      .set('Authorization', other.auth);
    expect(res.status).toBe(403);
  });

  it('ayudantes: edad en palabras y detalle de comidas', () => {
    expect(describeAge(23)).toBe('1 año y 11 meses');
    expect(describeAge(12)).toBe('1 año');
    expect(describeAge(8)).toBe('8 meses');
    expect(splitFeedingDetails('Comidas: Cena. Arroz')).toEqual({ meals: 'Cena', notes: 'Arroz' });
    expect(splitFeedingDetails('Solo texto')).toEqual({ meals: '', notes: 'Solo texto' });
    expect(splitFeedingDetails(null)).toEqual({ meals: '', notes: '' });
  });
});
