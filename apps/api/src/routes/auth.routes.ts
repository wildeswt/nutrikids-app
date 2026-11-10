import { RegisterInputSchema, type RegisterInput } from '@nutrikids/shared';
import { Router } from 'express';
import { validateRequest } from '../middlewares/validate.js';
import { registerUser } from '../services/auth.service.js';

export const authRouter: Router = Router();

authRouter.post('/register', validateRequest({ body: RegisterInputSchema }), async (req, res) => {
  const result = await registerUser(req.body as RegisterInput);
  res.status(201).json(result);
});
