import {
  CreateCheckupInputSchema,
  ErrorResponseSchema,
  ReferenceCurvesQuerySchema,
  RegisterInputSchema,
} from '@nutrikids/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middlewares/errorHandler.js';
import { validateRequest } from '../middlewares/validate.js';

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.post('/test/register', validateRequest({ body: RegisterInputSchema }), (req, res) => {
    res.status(200).json({ data: req.body });
  });

  app.post('/test/checkups', validateRequest({ body: CreateCheckupInputSchema }), (req, res) => {
    res.status(201).json({ data: req.body });
  });

  app.get('/test/curves', validateRequest({ query: ReferenceCurvesQuerySchema }), (req, res) => {
    res.status(200).json({ query: req.query });
  });

  app.use(errorHandler);
  return app;
}

describe('validateRequest middleware con esquemas de @nutrikids/shared', () => {
  const app = createTestApp();

  it('acepta un registro válido y entrega el cuerpo normalizado', async () => {
    const res = await request(app)
      .post('/test/register')
      .send({
        email: '  Ana@Correo.COM ',
        password: 'clave-segura-1',
        firstName: ' Ana ',
        lastName: ' Pérez ',
        roles: ['CAREGIVER'],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      email: 'ana@correo.com',
      password: 'clave-segura-1',
      firstName: 'Ana',
      lastName: 'Pérez',
      roles: ['CAREGIVER'],
    });
  });

  it('responde 400 con ErrorResponse e issues en español cuando falta especialidad en profesional', async () => {
    const res = await request(app)
      .post('/test/register')
      .send({
        email: 'luis@hospital.ec',
        password: 'clave-segura-1',
        firstName: 'Luis',
        lastName: 'Mora',
        roles: ['PROFESSIONAL'],
      });

    expect(res.status).toBe(400);
    const parsed = ErrorResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(res.body.error).toBe('Validation Error');
    expect(res.body.issues).toEqual(
      expect.arrayContaining([
        { path: 'specialty', message: 'La especialidad es obligatoria para profesionales' },
        {
          path: 'licenseNumber',
          message: 'El número de licencia es obligatorio para profesionales',
        },
      ]),
    );
  });

  it('exige confirmOutlier en valores atípicos de control y rechaza campos del servidor', async () => {
    const baseCheckup = {
      id: '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c',
      measuredAt: '2026-10-18T14:30:00-05:00',
      weightKg: 4.5,
      lengthHeightCm: 97.0,
      position: 'STANDING',
    };

    const outlierRes = await request(app).post('/test/checkups').send(baseCheckup);
    expect(outlierRes.status).toBe(400);
    expect(outlierRes.body.issues).toEqual([
      {
        path: 'confirmOutlier',
        message: 'El peso es atípico; confirma la medida antes de guardar',
      },
    ]);

    const confirmedRes = await request(app)
      .post('/test/checkups')
      .send({ ...baseCheckup, confirmOutlier: true });
    expect(confirmedRes.status).toBe(201);

    const spoofedOriginRes = await request(app)
      .post('/test/checkups')
      .send({ ...baseCheckup, weightKg: 12.2, origin: 'PROFESSIONAL' });
    expect(spoofedOriginRes.status).toBe(400);
  });

  it('valida parámetros de consulta (GET /test/curves) con ReferenceCurvesQuerySchema', async () => {
    const okRes = await request(app)
      .get('/test/curves')
      .query({ indicator: 'WEIGHT_FOR_LENGTH_HEIGHT', sex: 'MALE' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.query).toEqual({
      indicator: 'WEIGHT_FOR_LENGTH_HEIGHT',
      sex: 'MALE',
    });

    const badRes = await request(app)
      .get('/test/curves')
      .query({ indicator: 'INVALID', sex: 'MALE' });
    expect(badRes.status).toBe(400);
    expect(ErrorResponseSchema.safeParse(badRes.body).success).toBe(true);
  });
});
