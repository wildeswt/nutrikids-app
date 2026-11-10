import {
  LoginInputSchema,
  RegisterInputSchema,
  type LoginInput,
  type RegisterInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { createLoginRateLimiter } from '../middlewares/rateLimit.js';
import { validateRequest } from '../middlewares/validate.js';
import { loginUser, registerUser } from '../services/auth.service.js';

export function createAuthRouter(): Router {
  const router = Router();
  const loginRateLimiter = createLoginRateLimiter();

  router.post('/register', validateRequest({ body: RegisterInputSchema }), async (req, res) => {
    const result = await registerUser(req.body as RegisterInput);
    res.status(201).json(result);
  });

  router.post(
    '/login',
    loginRateLimiter,
    validateRequest({ body: LoginInputSchema }),
    async (req, res) => {
      const result = await loginUser(req.body as LoginInput);
      res.status(200).json(result);
    },
  );

  return router;
}

export const authRouter: Router = createAuthRouter();
