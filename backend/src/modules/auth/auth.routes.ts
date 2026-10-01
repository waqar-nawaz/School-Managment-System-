import { Router } from "express";
import * as auth from "./auth.controller";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/authenticate";
import { authLimiter, loginLimiter, refreshLimiter, passwordResetLimiter } from "../../middlewares/rateLimiter";
import {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
} from "./auth.validation";

const router = Router();

router.post("/login", loginLimiter, validate(loginSchema), auth.login);
router.post("/refresh", refreshLimiter, validate(refreshSchema), auth.refresh);
router.post("/logout", refreshLimiter, validate(refreshSchema), auth.logout);
router.post("/forgot-password", passwordResetLimiter, validate(forgotPasswordSchema), auth.forgotPassword);
router.post("/reset-password", passwordResetLimiter, validate(resetPasswordSchema), auth.resetPassword);
router.post("/verify-email", authLimiter, validate(verifyEmailSchema), auth.verifyEmail);
router.post("/send-verification", authenticate, authLimiter, auth.sendVerification);
router.get("/me", authenticate, auth.me);
router.post("/change-password", authenticate, authLimiter, validate(changePasswordSchema), auth.changePassword);

export default router;