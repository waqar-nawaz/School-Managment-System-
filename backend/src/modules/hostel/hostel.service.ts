import { Transaction, Op } from "sequelize";
import { ApiError } from "../../utils/ApiError";
import { sequelize } from "../../database/sequelize";
import { Bed, Room, Hostel, HostelAllocation, Student, Staff } from "../../models";
import { logger } from "../../config/logger";

/**
 * Single source of truth for hostel state.
 *
 *  - bed.status  "occupied" <=> the bed has an ACTIVE allocation. It is never set by hand.
 *    ("maintenance" is a manual state and is preserved.)
 *  - room.status "full" <=> the room has beds, none are free and at least one is occupied.
 *    ("maintenance" is a manual state and is preserved.)
 */
export async function syncRoom(roomId: number, t?: Transaction): Promise<void> {
  const room = await Room.findByPk(roomId, { transaction: t });
  if (!room || room.status === "maintenance") return;
  const [available, occupied] = await Promise.all([
    Bed.count({ where: { roomId, status: "available" }, transaction: t }),
    Bed.count({ where: { roomId, status: "occupied" }, transaction: t }),
  ]);
  const status = available === 0 && occupied > 0 ? "full" : "available";
  if (room.status !== status) await room.update({ status }, { transaction: t });
}

export async function syncBed(bedId: number, t?: Transaction): Promise<void> {
  const bed = await Bed.findByPk(bedId, { transaction: t });
  if (!bed) return;
  const active = await HostelAllocation.count({ where: { bedId, status: "active" }, transaction: t });
  let status = bed.status;
  if (active > 0) status = "occupied";
  else if (bed.status === "occupied") status = "available";
  if (status !== bed.status) await bed.update({ status }, { transaction: t });
  await syncRoom(Number(bed.roomId), t);
}

/** Repairs bed/room status on boot (older versions could leave beds stuck "occupied"/"available"). */
export async function reconcileHostelState(): Promise<void> {
  try {
    const beds = await Bed.findAll({ attributes: ["id"] });
    for (const b of beds) await syncBed(Number(b.id));
    const rooms = await Room.findAll({ attributes: ["id"] });
    for (const r of rooms) await syncRoom(Number(r.id));
    if (beds.length) logger.info(`Hostel: reconciled ${beds.length} bed(s) and ${rooms.length} room(s)`);
  } catch (err) {
    logger.warn(`Hostel reconcile skipped: ${(err as Error).message}`);
  }
}

/** Unique "one active allocation per bed / per student" guards that hold even under concurrent requests. */
export async function ensureHostelIndexes(): Promise<void> {
  const stmts = [
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_alloc_active_bed ON hostel_allocations ("bedId") WHERE status = 'active'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_alloc_active_student ON hostel_allocations ("studentId") WHERE status = 'active'`,
  ];
  for (const sql of stmts) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      logger.warn(`Could not create hostel unique index (duplicate active allocations already exist?): ${(err as Error).message}`);
    }
  }
}

/** Boys' hostels take male students, girls' hostels female students, co-ed hostels anyone. */
export function assertStudentFitsHostel(student: Student, hostel: Hostel): void {
  const g = String(hostel.gender ?? "coed");
  const sg = String(student.gender ?? "");
  const name = `${student.firstName} ${student.lastName}`.trim();
  if (g === "boys" && sg !== "male") throw ApiError.badRequest(`${name} cannot be placed in "${hostel.name}" (boys only)`);
  if (g === "girls" && sg !== "female") throw ApiError.badRequest(`${name} cannot be placed in "${hostel.name}" (girls only)`);
}

export interface BedChain { bed: Bed; room: Room; hostel: Hostel }

/** Load a bed with its room and hostel, enforcing branch scope. Locks the bed row inside a transaction. */
export async function loadBedChain(bedId: number, branchId: number | null | undefined, t: Transaction, forUpdate = true): Promise<BedChain> {
  const bed = await Bed.findByPk(bedId, { transaction: t, ...(forUpdate ? { lock: t.LOCK.UPDATE } : {}) });
  if (!bed || (branchId != null && Number(bed.branchId) !== Number(branchId))) throw ApiError.badRequest("Selected bed was not found in your branch");
  const room = await Room.findByPk(bed.roomId, { transaction: t });
  const hostel = room ? await Hostel.findByPk(room.hostelId, { transaction: t }) : null;
  if (!room || !hostel) throw ApiError.badRequest("Bed is not attached to a valid room/hostel");
  return { bed, room, hostel };
}

/** A bed can be given to a student only if it is free, its room is usable and its hostel is active. */
export function assertBedAssignable({ bed, room, hostel }: BedChain): void {
  if (hostel.isActive === false) throw ApiError.badRequest(`Hostel "${hostel.name}" is inactive`);
  if (room.status === "maintenance") throw ApiError.badRequest(`Room ${room.roomNo} is under maintenance`);
  if (bed.status === "maintenance") throw ApiError.badRequest(`Bed ${bed.bedNo} is under maintenance`);
  if (bed.status !== "available") throw ApiError.badRequest(`Bed ${bed.bedNo} in room ${room.roomNo} is already occupied`);
}

export async function activeAllocationCount(where: Record<string, unknown>): Promise<number> {
  return HostelAllocation.count({ where: { status: "active", ...where } as any });
}

export { Op };

/**
 * Older databases stored the warden as free text (hostels.wardenName). Link each hostel to the
 * matching active hostel-warden employee when the name matches exactly one person; leave the rest
 * alone. Idempotent (only touches hostels that have no warden yet) and silent when the old column
 * does not exist.
 */
export async function migrateWardenNames(): Promise<void> {
  try {
    const [rows] = (await sequelize.query(
      `SELECT id, "branchId", "wardenName" FROM hostels WHERE "wardenId" IS NULL AND "wardenName" IS NOT NULL AND trim("wardenName") <> ''`
    )) as unknown as [Array<{ id: number; branchId: number | null; wardenName: string }>, unknown];
    let linked = 0;
    for (const h of rows) {
      const wanted = h.wardenName.trim().toLowerCase().replace(/\s+/g, " ");
      const wardens = await Staff.findAll({ where: { isActive: true, employeeType: "hostel_warden", ...(h.branchId != null ? { branchId: h.branchId } : {}) } });
      const hits = wardens.filter((w) => `${w.firstName} ${w.lastName}`.trim().toLowerCase().replace(/\s+/g, " ") === wanted);
      if (hits.length === 1) {
        await Hostel.update({ wardenId: hits[0].id } as any, { where: { id: h.id } });
        linked++;
      }
    }
    if (linked) logger.info(`Hostel: linked ${linked} hostel(s) to their warden by name`);
  } catch {
    /* no legacy wardenName column: nothing to migrate */
  }
}
