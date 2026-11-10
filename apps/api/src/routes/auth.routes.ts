import {
  ForgotPasswordInputSchema,
  LoginInputSchema,
  LogoutInputSchema,
  RefreshInputSchema,
  RegisterInputSchema,
  ResetPasswordInputSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { createLoginRateLimiter } from '../middlewares/rateLimit.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  loginUser,
  logoutUser,
  refreshUserSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from '../services/auth.service.js';

export function createAuthRouter(): Router {
  const router = Router();
  const loginRateLimiter = createLoginRateLimiter();
  const forgotPasswordLimiter = createLoginRateLimiter();

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

  router.post('/refresh', validateRequest({ body: RefreshInputSchema }), async (req, res) => {
    const result = await refreshUserSession(req.body as RefreshInput);
    res.status(200).json(result);
  });

  router.post('/logout', validateRequest({ body: LogoutInputSchema }), async (req, res) => {
    await logoutUser(req.body as LogoutInput);
    res.status(204).send();
  });

  router.post(
    '/forgot-password',
    forgotPasswordLimiter,
    validateRequest({ body: ForgotPasswordInputSchema }),
    async (req, res) => {
      const result = await requestPasswordReset(req.body as ForgotPasswordInput);
      res.status(202).json(result);
    },
  );

  router.post(
    '/reset-password',
    validateRequest({ body: ResetPasswordInputSchema }),
    async (req, res) => {
      await resetPassword(req.body as ResetPasswordInput);
      res.status(204).send();
    },
  );

  return router;
}

export const authRouter: Router = createAuthRouter();
