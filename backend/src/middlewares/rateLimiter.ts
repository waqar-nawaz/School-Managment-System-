import rateLimit from "express-rate-limit";
import env from "../config";
import { verifyAccessToken } from "../utils/token.util";

/**
 * Signed-in users get their own bucket (verified token, so it can't be spoofed); only anonymous
 * traffic is counted per IP. Counting everything per IP made a whole school behind one public IP
 * share a single 120 req/min budget.
 */
const bucketKey = (req: any): string => {
  const h = req.headers?.authorization as string | undefined;
  if (h?.startsWith("Bearer ")) {
    try {
      return `u:${verifyAccessToken(h.slice(7)).sub}`;
    } catch {
      /* invalid/expired token -> fall back to the IP bucket */
    }
  }
  return `ip:${req.ip}`;
};

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  // Authenticated users: 4x the anonymous budget (a normal screen fires several requests).
  max: (req: any) => (bucketKey(req).startsWith("u:") ? env.rateLimit.max * 4 : env.rateLimit.max),
  keyGenerator: bucketKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down" },
});

// Login: 10 FAILED attempts / 15 min per IP. Successful logins don't count, so a school
// sharing one public IP can't lock itself out just by signing in.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many failed login attempts. Try again in a few minutes." },
});

// Token refresh/logout run in the background on every page: separate, much higher budget
// (previously shared with login, which made refresh return 429 and logged users out).
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down" },
});

// Other authenticated auth actions (change password, verify email).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication attempts" },
});

// Even stricter for password reset endpoints (5 / 15min).
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset attempts" },
});