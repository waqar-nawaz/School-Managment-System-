import { Op } from "sequelize";

/** Case-insensitive LIKE (PostgreSQL ILIKE). */
export const likeOp = Op.iLike;
