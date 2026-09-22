import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import env from "../config";
import { ApiError } from "../utils/ApiError";
import asyncHandler from "../utils/asyncHandler";

export interface JwtAccessPayload {
  sub: string;
  role: string;
  claims: string[];
  branchId?: number | null;
}

export const authenticate = asyncHandler(
  async (req, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing bearer token");
    }

    const token = header.slice(7).trim();
    try {
      const decoded = jwt.verify(token, env.jwt.secret) as JwtAccessPayload;
      req.user = {
        id: parseInt(decoded.sub, 10),
        role: decoded.role,
        claims: decoded.claims || [],
        branchId: decoded.branchId ?? null,
      };
      next();
    } catch {
      throw ApiError.unauthorized("Invalid or expired token");
    }
  }
);