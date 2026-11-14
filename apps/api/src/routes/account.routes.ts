import { UpdateAccountInputSchema, type UpdateAccountInput } from '@nutrikids/shared';
import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { validateRequest } from '../middlewares/validate.js';
import { getAccount, updateAccount } from '../services/account.service.js';

/** Cuenta del usuario autenticado (NK-55). */
export function createAccountRouter(): Router {
  const router = Router();

  router.use(authenticate);

  /** GET /account: nombre, correo y teléfono de contacto. */
  router.get('/', async (req, res) => {
    res.status(200).json(await getAccount(req.auth!));
  });

  /** PATCH /account: edita nombre, correo y teléfono (el correo exige la contraseña actual). */
  router.patch('/', validateRequest({ body: UpdateAccountInputSchema }), async (req, res) => {
    res.status(200).json(await updateAccount(req.auth!, req.body as UpdateAccountInput));
  });

  return router;
}
