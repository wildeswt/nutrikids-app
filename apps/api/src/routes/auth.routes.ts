import {
  ForgotPasswordInputSchema,
  LoginInputSchema,
  LogoutInputSchema,
  RefreshInputSchema,
  RegenerateRecoveryCodesInputSchema,
  RegisterInputSchema,
  ResetPasswordInputSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
  type RegenerateRecoveryCodesInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@nutrikids/shared';
import { Router } from 'express';
import { requireRole } from '../middlewares/access.js';
import { authenticate } from '../middlewares/authenticate.js';
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
import { getTwoFactorStatus, regenerateRecoveryCodes } from '../services/twoFactor.service.js';

export function createAuthRouter(): Router {
  const router = Router();
  const loginRateLimiter = createLoginRateLimiter();
  const forgotPasswordLimiter = createLoginRateLimiter();
  const recoveryCodesLimiter = createLoginRateLimiter();

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

  /** GET /auth/2fa/status: si el segundo factor está activo y cuántos códigos de recuperación quedan (NK-10). */
  router.get('/2fa/status', authenticate, requireRole('PROFESSIONAL'), async (req, res) => {
    res.status(200).json(await getTwoFactorStatus(req.auth!.userId));
  });

  /** POST /auth/2fa/recovery-codes: genera códigos nuevos (invalida los anteriores); exige TOTP vigente. */
  router.post(
    '/2fa/recovery-codes',
    recoveryCodesLimiter,
    authenticate,
    requireRole('PROFESSIONAL'),
    validateRequest({ body: RegenerateRecoveryCodesInputSchema }),
    async (req, res) => {
      const { totpCode } = req.body as RegenerateRecoveryCodesInput;
      res.status(200).json(await regenerateRecoveryCodes(req.auth!.userId, totpCode));
    },
  );

  return router;
}

export const authRouter: Router = createAuthRouter();
