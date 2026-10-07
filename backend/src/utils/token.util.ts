import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import env from "../config";

export interface TokenPayload {
  sub: string;
  role: string;
  branchId?: number | null;
  claims: string[];
  type: "access" | "refresh";
}

export function signAccessToken(
  sub: string,
  role: string,
  claims: string[],
  branchId?: number | null
): string {
  return jwt.sign({ sub, role, claims, branchId, type: "access" }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(sub: string): string {
  // jwtid makes every refresh token unique. Without it two logins (or a login followed by a refresh)
  // for the same user in the same second produced the SAME token, and the second one failed with
  // "tokenHash must be unique".
  return jwt.sign({ sub, type: "refresh" }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions["expiresIn"],
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwt.secret) as TokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string; type: string } {
  return jwt.verify(token, env.jwt.refreshSecret) as { sub: string; type: string };
}