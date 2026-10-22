import { Op, WhereOptions } from "sequelize";
import { sequelize } from "../database/sequelize";

/** Rows whose own text columns match, OR whose student's name / admission number matches. */
export function searchWithStudent(columns: string[], studentColumn = "studentId") {
  return (q: string): WhereOptions => {
    const like = sequelize.escape(`%${q}%`);
    const own = columns.map((c) => ({ [c]: { [Op.iLike]: `%${q}%` } }));
    return {
      [Op.or]: [
        ...own,
        { [studentColumn]: { [Op.in]: sequelize.literal(`(SELECT id FROM students WHERE "firstName" ILIKE ${like} OR "lastName" ILIKE ${like} OR "admissionNo" ILIKE ${like} OR CONCAT("firstName", ' ', "lastName") ILIKE ${like})`) } },
      ],
    } as WhereOptions;
  };
}
