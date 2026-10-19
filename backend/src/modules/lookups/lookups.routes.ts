import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { AcademicYear, Section, SchoolClass, Subject, Teacher, Term } from "../../models";

/**
 * Name-only lookups for the UI. Tables such as Periods, Timetable and Assignments store class / subject /
 * section / teacher ids; students, parents and teachers may see those rows but do not hold the
 * `classes:read`-style permissions needed to list the full records. This returns just { id, name } (no contact
 * or HR columns), scoped to the caller's branch, to any signed-in user.
 */
const router = Router();
router.use(authenticate);

type Def = { model: any; label: (r: any) => string };
const LOOKUPS: Record<string, Def> = {
  classes: { model: SchoolClass, label: (r) => r.name },
  sections: { model: Section, label: (r) => r.name },
  subjects: { model: Subject, label: (r) => r.name },
  teachers: { model: Teacher, label: (r) => [r.firstName, r.lastName].filter(Boolean).join(" ") },
  "academic-years": { model: AcademicYear, label: (r) => r.name },
  terms: { model: Term, label: (r) => r.name },
};

router.get("/:type", asyncHandler(async (req, res) => {
  const def = LOOKUPS[req.params.type];
  if (!def) throw ApiError.notFound("Unknown lookup");
  const ids = String(req.query.ids ?? "");
  if (!/^\d+(,\d+){0,199}$/.test(ids)) throw ApiError.badRequest("ids must be a comma-separated list of up to 200 ids");
  const where: Record<string, unknown> = { id: ids.split(",").map(Number) };
  const branchId = req.user?.branchId;
  if (branchId != null && def.model.getAttributes().branchId) where.branchId = branchId;
  const rows = await def.model.findAll({ where, limit: 200 });
  res.status(200).json({ success: true, message: "Lookup fetched", data: rows.map((r: any) => ({ id: r.id, name: def.label(r) })) });
}));

export default router;
