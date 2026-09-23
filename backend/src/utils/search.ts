import { Op } from "sequelize";
import { sequelize } from "../database/sequelize";

/**
 * Case-insensitive LIKE for the active dialect.
 * MySQL's LIKE is case-insensitive by default; PostgreSQL needs ILIKE.
 */
export const likeOp = sequelize.getDialect() === "postgres" ? Op.iLike : Op.like;
