import {
  AssignCaregiverInputSchema,
  AssignProfessionalInputSchema,
  CreateChildInputSchema,
  EndProfessionalAssignmentInputSchema,
  UpdateCaregiverLinkInputSchema,
  UuidSchema,
  type AssignCaregiverInput,
  type AssignProfessionalInput,
  type CreateChildInput,
  type EndProfessionalAssignmentInput,
  type UpdateCaregiverLinkInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, requireRole, requireVinculo } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  assignCaregiver,
  assignProfessional,
  createChild,
  endProfessionalAssignment,
  getChildById,
  listChildCaregivers,
  listChildProfessionals,
  listChildren,
  removeCaregiverLink,
  updateCaregiverLink,
} from '../services/children.service.js';

const ChildProfessionalParamsSchema = z.object({
  childId: UuidSchema,
  professionalId: UuidSchema,
});

const ChildCaregiverParamsSchema = z.object({
  childId: UuidSchema,
  caregiverId: UuidSchema,
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
    async (req, res) => {
      const child = await createChild(req.auth!, req.body as CreateChildInput);
      res.status(201).json(child);
    },
  );

  /**
   * GET /children
   * Devuelve solo los niños vinculados al usuario autenticado:
   * - Cuidador: niños de `cuida`
   * - Profesional: niños de `atiende` con vínculo vigente hoy
   */
  router.get('/', requirePermission('child:read'), async (req, res) => {
    const children = await listChildren(req.auth!);
    res.status(200).json(children);
  });

  /**
   * GET /children/:childId
   * Devuelve los datos mínimos de un niño específico.
   * Requiere vínculo vigente (cuidador vía cuida o profesional vía atiende).
   */
  router.get(
    '/:childId',
    requirePermission('child:read'),
    requireVinculo('childId'),
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
    requireVinculo('childId'),
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
    requireVinculo('childId'),
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
    requireVinculo('childId'),
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
    requireVinculo('childId'),
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
    requireVinculo('childId'),
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
    requireVinculo('childId'),
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
    requireVinculo('childId'),
    validateRequest({ params: ChildCaregiverParamsSchema }),
    async (req, res) => {
      const { childId, caregiverId } = req.params as z.infer<typeof ChildCaregiverParamsSchema>;
      await removeCaregiverLink(req.auth!, childId, caregiverId);
      res.status(204).send();
    },
  );

  return router;
}
