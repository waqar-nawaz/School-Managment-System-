import { Router } from "express";
import * as auth from "./auth.controller";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/authenticate";
import { authLimiter } from "../../middlewares/rateLimiter";
import {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
} from "./auth.validation";

const router = Router();

router.post("/login", authLimiter, validate(loginSchema), auth.login);
router.post("/refresh", validate(refreshSchema), auth.refresh);
router.post("/logout", validate(refreshSchema), auth.logout);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), auth.forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), auth.resetPassword);
router.post("/verify-email", validate(verifyEmailSchema), auth.verifyEmail);
router.get("/me", authenticate, auth.me);
router.post("/change-password", authenticate, validate(changePasswordSchema), auth.changePassword);

export default router;