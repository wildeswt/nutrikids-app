import {
  AssignCaregiverInputSchema,
  AssignProfessionalInputSchema,
  CreateCheckupInputSchema,
  CreateChildInputSchema,
  CreateFollowUpInputSchema,
  EndProfessionalAssignmentInputSchema,
  GrantConsentInputSchema,
  UpdateCaregiverLinkInputSchema,
  UuidSchema,
  type AssignCaregiverInput,
  type AssignProfessionalInput,
  type CreateCheckupInput,
  type CreateChildInput,
  type CreateFollowUpInput,
  type EndProfessionalAssignmentInput,
  type GrantConsentInput,
  type UpdateCaregiverLinkInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { z } from 'zod';
import {
  requireActiveConsent,
  requirePermission,
  requireRole,
  requireLink,
} from '../middlewares/access.js';
import { auditHealth } from '../middlewares/auditHealth.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { createCheckup, listChildCheckups } from '../services/checkups.service.js';
import {
  assignCaregiver,
  assignProfessional,
  createChild,
  endProfessionalAssignment,
  getChildById,
  getChildConsent,
  grantConsent,
  listChildCaregivers,
  listChildProfessionals,
  listChildren,
  removeCaregiverLink,
  revokeConsent,
  updateCaregiverLink,
} from '../services/children.service.js';
import { createFollowUp } from '../services/followUps.service.js';

const ChildProfessionalParamsSchema = z.object({
  childId: UuidSchema,
  professionalId: UuidSchema,
});

const ChildCaregiverParamsSchema = z.object({
  childId: UuidSchema,
  caregiverId: UuidSchema,
});

const ListCheckupsQuerySchema = z.object({
  onlyCurrent: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export function createChildrenRouter(): Router {
  const router = Router();

  // Exige token de acceso en todas las rutas de /children
  router.use(authenticate);

  /**
   * POST /children
   * Alta del niño (solo cuidador representante legal).
   * Requiere rol CAREGIVER y body con datos mínimos, parentesco y representante legal.
   */
  router.post(
    '/',
    requireRole('CAREGIVER'),
    validateRequest({ body: CreateChildInputSchema }),
    auditHealth({
      action: 'CREATE',
      entityType: 'children',
      getEntityId: (_req, res) => res.locals.auditEntityId as string | undefined,
    }),
    async (req, res) => {
      const child = await createChild(req.auth!, req.body as CreateChildInput);
      res.locals.auditEntityId = child.id;
      res.status(201).json(child);
    },
  );

  /**
   * GET /children
   * Devuelve solo los niños vinculados al usuario autenticado:
   * - Cuidador: niños de `cuida`
   * - Profesional: niños de `atiende` con vínculo vigente hoy
   */
  router.get(
    '/',
    requirePermission('child:read'),
    auditHealth({ action: 'READ', entityType: 'children', getEntityId: () => null }),
    async (req, res) => {
      const children = await listChildren(req.auth!);
      res.status(200).json(children);
    },
  );

  /**
   * GET /children/:childId
   * Devuelve los datos mínimos de un niño específico.
   * Requiere vínculo vigente (cuidador vía cuida o profesional vía atiende).
   */
  router.get(
    '/:childId',
    requirePermission('child:read'),
    requireLink('childId'),
    auditHealth({ action: 'READ', entityType: 'children' }),
    async (req, res) => {
      const child = await getChildById(req.auth!, req.params.childId as string);
      res.status(200).json(child);
    },
  );

  /**
   * GET /children/:childId/professionals
   * Lista los vínculos `atiende` del niño para consultar asignaciones vigentes o pasadas.
   */
  router.get(
    '/:childId/professionals',
    requirePermission('child:read'),
    requireLink('childId'),
    async (req, res) => {
      const assignments = await listChildProfessionals(req.auth!, req.params.childId as string);
      res.status(200).json(assignments);
    },
  );

  /**
   * POST /children/:childId/professionals
   * Asigna un profesional a un niño (`atiende` con vigencia).
   * Autorizado solo para el representante legal o un profesional con vínculo vigente.
   */
  router.post(
    '/:childId/professionals',
    requireLink('childId'),
    validateRequest({ body: AssignProfessionalInputSchema }),
    async (req, res) => {
      const assignment = await assignProfessional(
        req.auth!,
        req.params.childId as string,
        req.body as AssignProfessionalInput,
      );
      res.status(201).json(assignment);
    },
  );

  /**
   * PATCH /children/:childId/professionals/:professionalId/end
   * Finaliza el vínculo vigente de un profesional con el niño estableciendo `endDate`.
   * Autorizado solo para el representante legal o el propio profesional asignado.
   */
  router.patch(
    '/:childId/professionals/:professionalId/end',
    requireLink('childId'),
    validateRequest({
      params: ChildProfessionalParamsSchema,
      body: EndProfessionalAssignmentInputSchema,
    }),
    async (req, res) => {
      const { childId, professionalId } = req.params as z.infer<
        typeof ChildProfessionalParamsSchema
      >;
      const assignment = await endProfessionalAssignment(
        req.auth!,
        childId,
        professionalId,
        req.body as EndProfessionalAssignmentInput,
      );
      res.status(200).json(assignment);
    },
  );

  /**
   * GET /children/:childId/caregivers
   * Lista los vínculos `cuida` del niño (cuidadores vinculados, parentesco y si son representantes legales).
   */
  router.get(
    '/:childId/caregivers',
    requirePermission('child:read'),
    requireLink('childId'),
    async (req, res) => {
      const caregivers = await listChildCaregivers(req.auth!, req.params.childId as string);
      res.status(200).json(caregivers);
    },
  );

  /**
   * POST /children/:childId/caregivers
   * Vincula a un cuidador adicional a un niño (`cuida`).
   * Autorizado exclusivamente para el representante legal del niño.
   */
  router.post(
    '/:childId/caregivers',
    requireLink('childId'),
    validateRequest({ body: AssignCaregiverInputSchema }),
    async (req, res) => {
      const assignment = await assignCaregiver(
        req.auth!,
        req.params.childId as string,
        req.body as AssignCaregiverInput,
      );
      res.status(201).json(assignment);
    },
  );

  /**
   * PATCH /children/:childId/caregivers/:caregiverId
   * Actualiza el parentesco o condición de representante legal de un cuidador vinculado.
   * Autorizado exclusivamente para el representante legal del niño.
   */
  router.patch(
    '/:childId/caregivers/:caregiverId',
    requireLink('childId'),
    validateRequest({
      params: ChildCaregiverParamsSchema,
      body: UpdateCaregiverLinkInputSchema,
    }),
    async (req, res) => {
      const { childId, caregiverId } = req.params as z.infer<typeof ChildCaregiverParamsSchema>;
      const updated = await updateCaregiverLink(
        req.auth!,
        childId,
        caregiverId,
        req.body as UpdateCaregiverLinkInput,
      );
      res.status(200).json(updated);
    },
  );

  /**
   * DELETE /children/:childId/caregivers/:caregiverId
   * Desvincula a un cuidador de un niño (`cuida`).
   * Autorizado exclusivamente para el representante legal del niño, impidiendo eliminar al último representante legal.
   */
  router.delete(
    '/:childId/caregivers/:caregiverId',
    requireLink('childId'),
    validateRequest({ params: ChildCaregiverParamsSchema }),
    async (req, res) => {
      const { childId, caregiverId } = req.params as z.infer<typeof ChildCaregiverParamsSchema>;
      await removeCaregiverLink(req.auth!, childId, caregiverId);
      res.status(204).send();
    },
  );

  /**
   * GET /children/:childId/consent
   * Consulta el consentimiento informado del niño (vigente o el más reciente).
   * Requiere permiso child:read y vínculo vigente sobre el niño.
   */
  router.get(
    '/:childId/consent',
    requirePermission('child:read'),
    requireLink('childId'),
    auditHealth({
      action: 'READ',
      entityType: 'consents',
      getEntityId: (req) => req.params.childId as string,
    }),
    async (req, res) => {
      const consent = await getChildConsent(req.auth!, req.params.childId as string);
      res.status(200).json(consent);
    },
  );

  /**
   * POST /children/:childId/consent
   * Otorga o renueva el consentimiento informado con una versión de texto (RF-02).
   * Autorizado exclusivamente para el representante legal del niño.
   */
  router.post(
    '/:childId/consent',
    requireRole('CAREGIVER'),
    requireLink('childId'),
    validateRequest({ body: GrantConsentInputSchema }),
    auditHealth({
      action: 'CREATE',
      entityType: 'consents',
      getEntityId: (_req, res) => res.locals.auditEntityId as string | undefined,
    }),
    async (req, res) => {
      const consent = await grantConsent(
        req.auth!,
        req.params.childId as string,
        req.body as GrantConsentInput,
      );
      res.locals.auditEntityId = consent.id;
      res.status(201).json(consent);
    },
  );

  /**
   * DELETE /children/:childId/consent
   * Revoca el consentimiento informado vigente del niño (revocación lógica con revokedAt = now()).
   * Autorizado exclusivamente para el representante legal del niño.
   */
  router.delete(
    '/:childId/consent',
    requireRole('CAREGIVER'),
    requireLink('childId'),
    auditHealth({
      action: 'REVOKE',
      entityType: 'consents',
      getEntityId: (_req, res) => res.locals.auditEntityId as string | undefined,
    }),
    async (req, res) => {
      const consent = await revokeConsent(req.auth!, req.params.childId as string);
      res.locals.auditEntityId = consent.id;
      res.status(200).json(consent);
    },
  );

  /**
   * GET /children/:childId/checkups
   * Historial completo de controles (incluye los reemplazados por una corrección), ordenado por
   * fecha de medición descendente. `?onlyCurrent=true` devuelve solo los controles vigentes.
   * El cuidador no recibe z-scores, percentiles ni clasificaciones (RF-14).
   */
  router.get(
    '/:childId/checkups',
    requirePermission('checkup:read'),
    requireLink('childId'),
    auditHealth({
      action: 'READ',
      entityType: 'checkups',
      getEntityId: (req) => req.params.childId as string,
    }),
    validateRequest({ query: ListCheckupsQuerySchema }),
    async (req, res) => {
      const { onlyCurrent } = req.query as unknown as z.infer<typeof ListCheckupsQuerySchema>;
      const checkups = await listChildCheckups(
        req.auth!,
        req.link!,
        req.params.childId as string,
        onlyCurrent,
      );
      res.status(200).json(checkups);
    },
  );

  /**
   * POST /children/:childId/checkups
   * Registra un control con UUID generado en el cliente; reenviar el mismo id devuelve el control
   * existente (200) sin duplicarlo. `origin` y `recordedById` los asigna el servidor.
   * Requiere vínculo y consentimiento informado vigente.
   */
  router.post(
    '/:childId/checkups',
    requirePermission('checkup:create'),
    requireLink('childId'),
    requireActiveConsent('childId'),
    validateRequest({ body: CreateCheckupInputSchema }),
    auditHealth({
      action: 'CREATE',
      entityType: 'checkups',
      getEntityId: (_req, res) => res.locals.auditEntityId as string | undefined,
    }),
    async (req, res) => {
      const { checkup, created } = await createCheckup(
        req.auth!,
        req.link!,
        req.params.childId as string,
        req.body as CreateCheckupInput,
      );
      res.locals.auditEntityId = checkup.id;
      res.status(created ? 201 : 200).json(checkup);
    },
  );

  /**
   * POST /children/:childId/follow-ups
   * Registra un seguimiento clínico (RF-15): observación, recomendación, intervención o
   * derivación, opcionalmente ligado a una alerta del niño. Si trae `nextCheckupDate` se crea
   * el recordatorio del próximo control. Idempotente por `id` del cliente (reenvío → 200).
   * Solo profesionales con `followup:create`, vínculo `atiende` vigente y consentimiento vigente.
   */
  router.post(
    '/:childId/follow-ups',
    requireRole('PROFESSIONAL'),
    requirePermission('followup:create'),
    requireLink('childId'),
    requireActiveConsent('childId'),
    validateRequest({ body: CreateFollowUpInputSchema }),
    auditHealth({
      action: 'CREATE',
      entityType: 'follow_ups',
      getEntityId: (_req, res) => res.locals.auditEntityId as string | undefined,
    }),
    async (req, res) => {
      const { followUp, created } = await createFollowUp(
        req.auth!,
        req.params.childId as string,
        req.body as CreateFollowUpInput,
      );
      res.locals.auditEntityId = followUp.id;
      res.status(created ? 201 : 200).json(followUp);
    },
  );

  return router;
}
