import { NextFunction, Request, Response } from "express";
import { ZodSchema, ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import asyncHandler from "../utils/asyncHandler";

type ValidateSource = "body" | "query" | "params";

export const validate =
  (schema: ZodSchema, source: ValidateSource = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const target = req[source] ?? {};
    const result = schema.safeParse(target);
    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return next(ApiError.validation(errors));
    }
    (req as any)[source] = result.data;
    next();
  };

export default asyncHandler;