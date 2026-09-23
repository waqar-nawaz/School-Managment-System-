import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { logger } from "../config/logger";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  if (err instanceof ApiError) {
    return ApiResponse.error(res, err.statusCode, err.message, err.errors);
  }

  if (typeof err === "object" && err !== null && "name" in err) {
    const name = (err as any).name as string;
    if (name === "SequelizeUniqueConstraintError") {
      const message = (err as any).errors?.map((e: any) => e.message).join(", ") || "Duplicate entry";
      return ApiResponse.error(res, 409, message);
    }
    if (name === "SequelizeForeignKeyConstraintError") {
      return ApiResponse.error(
        res,
        400,
        "Invalid reference: a selected related record does not exist."
      );
    }
    if (name === "SequelizeValidationError") {
      const fields = (err as any).errors?.map((e: any) => e.message).join(", ") || "Validation error";
      return ApiResponse.error(res, 400, fields);
    }
    if (name === "SequelizeDatabaseError") {
      return ApiResponse.error(res, 400, (err as any).parent?.sqlMessage || "Database error");
    }
  }

  logger.error(`${req.method} ${req.originalUrl} -> ${(err as Error).message}`, {
    stack: (err as Error).stack,
  });
  return ApiResponse.error(res, 500, "Internal server error");
};