/** Hostels, rooms and beds. (Allocations have their own router: modules/hostel/allocations.routes.ts) */
import { Request } from "express";
import { Op } from "sequelize";
import { ApiError } from "../../../utils/ApiError";
import { Hostel, Room, Bed, HostelAllocation } from "../../../models";
import { ResourceDefinition, getExisting, plain } from "./shared";
import { syncRoom, activeAllocationCount } from "../../hostel/hostel.service";

const ROOM_MANUAL_STATUSES = ["available", "maintenance"];
const BED_MANUAL_STATUSES = ["available", "maintenance"];

// ---------------------------------------------------------------- hostels
const validateHostel = async (body: any, req: Request) => {
  const existing = await getExisting(Hostel, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const gender = String(body.gender ?? existing?.gender ?? "");
  const branchId = req.user?.branchId ?? existing?.branchId ?? null;
  if (!name) throw ApiError.badRequest("Hostel name is required");
  if (!["boys", "girls", "coed"].includes(gender)) throw ApiError.badRequest("Hostel type must be boys, girls or coed");

  const clash = await Hostel.findOne({
    where: { name: { [Op.iLike]: name }, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  if (clash) throw ApiError.conflict(`A hostel named "${clash.name}" already exists`);

  if (existing) {
    const activeCount = await activeAllocationCount({ hostelId: existing.id });
    if (body.isActive === false && existing.isActive !== false && activeCount > 0) {
      throw ApiError.badRequest(`Cannot deactivate: ${activeCount} student(s) currently live here. Check them out or transfer them first.`);
    }
    if (gender !== existing.gender && gender !== "coed" && activeCount > 0) {
      throw ApiError.badRequest("Cannot change the hostel type while students are living in it");
    }
  }

  // Capacity is derived from the actual beds; keep the legacy column untouched.
  body.name = name; body.gender = gender; body.capacity = existing?.capacity ?? 0; body.branchId = branchId;
  return body;
};

// ---------------------------------------------------------------- rooms
const validateRoom = async (body: any, req: Request) => {
  const existing = await getExisting(Room, req);
  const hostelId = Number(body.hostelId ?? existing?.hostelId);
  const roomNo = String(body.roomNo ?? existing?.roomNo ?? "").trim();
  const capacity = Number(body.capacity ?? existing?.capacity ?? 4);
  const branchId = req.user?.branchId ?? existing?.branchId ?? null;
  if (!Number.isInteger(hostelId) || hostelId <= 0) throw ApiError.badRequest("Please choose a hostel");
  if (!roomNo) throw ApiError.badRequest("Room number is required");
  if (!Number.isInteger(capacity) || capacity < 1) throw ApiError.badRequest("Bed capacity must be at least 1");

  const hostel = await Hostel.findByPk(hostelId);
  if (!hostel || hostel.isActive === false || (branchId != null && Number(hostel.branchId) !== Number(branchId))) {
    throw ApiError.badRequest("Hostel does not belong to your branch or is inactive");
  }

  if (existing) {
    const bedCount = await Bed.count({ where: { roomId: existing.id } });
    if (capacity < bedCount) throw ApiError.badRequest(`This room already has ${bedCount} bed(s); capacity cannot be lower`);
    // Moving a room that has beds would desync every allocation's hostel.
    if (Number(existing.hostelId) !== hostelId && bedCount > 0) {
      throw ApiError.badRequest("A room that already has beds cannot be moved to another hostel");
    }
  }

  const duplicate = await Room.findOne({ where: { hostelId, roomNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.conflict(`Room ${roomNo} already exists in ${hostel.name}`);

  // "full" is derived from the beds; only available/maintenance can be chosen by hand.
  if (body.status !== undefined && body.status !== "full" && !ROOM_MANUAL_STATUSES.includes(String(body.status))) {
    throw ApiError.badRequest("Room status must be available or maintenance");
  }
  if (body.status === "maintenance" && existing) {
    const live = await activeAllocationCount({ roomId: existing.id });
    if (live > 0) throw ApiError.badRequest(`Cannot put the room under maintenance: ${live} student(s) live in it`);
  }
  if (body.status === "full") delete body.status;
  if (body.status === undefined && !existing) body.status = "available";

  body.hostelId = hostelId; body.roomNo = roomNo; body.capacity = capacity; body.branchId = branchId;
  return body;
};

// ---------------------------------------------------------------- beds
const validateBed = async (body: any, req: Request) => {
  const existing = await getExisting(Bed, req);
  const roomId = Number(body.roomId ?? existing?.roomId);
  const bedNo = String(body.bedNo ?? existing?.bedNo ?? "").trim();
  const branchId = req.user?.branchId ?? existing?.branchId ?? null;
  if (!Number.isInteger(roomId) || roomId <= 0) throw ApiError.badRequest("Please choose a room");
  if (!bedNo) throw ApiError.badRequest("Bed number is required");

  const room = await Room.findByPk(roomId);
  if (!room || (branchId != null && Number(room.branchId) !== Number(branchId))) throw ApiError.badRequest("Room does not belong to your branch");
  const hostel = await Hostel.findByPk(room.hostelId);
  if (!hostel || hostel.isActive === false || (branchId != null && Number(hostel.branchId) !== Number(branchId))) {
    throw ApiError.badRequest("Room's hostel is inactive or outside your branch");
  }

  const duplicate = await Bed.findOne({ where: { roomId, bedNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.conflict(`Bed ${bedNo} already exists in room ${room.roomNo}`);

  const roomChanged = !existing || Number(existing.roomId) !== roomId;
  if (roomChanged) {
    const bedCount = await Bed.count({ where: { roomId } });
    if (bedCount >= Number(room.capacity)) {
      throw ApiError.badRequest(`Room ${room.roomNo} already has ${bedCount} of ${room.capacity} beds. Increase the room capacity first.`);
    }
  }

  // "occupied" belongs to allocations: it is set/cleared automatically and never by hand.
  if (body.status !== undefined) {
    const wanted = String(body.status);
    if (wanted === "occupied") {
      if (!(existing && existing.status === "occupied")) throw ApiError.badRequest("A bed becomes occupied only when a student is allocated to it");
      delete body.status;
    } else if (!BED_MANUAL_STATUSES.includes(wanted)) {
      throw ApiError.badRequest("Bed status must be available or maintenance");
    }
  }
  if (existing && existing.status === "occupied") {
    if (roomChanged) throw ApiError.badRequest("An occupied bed cannot be moved to another room");
    if (body.status !== undefined && body.status !== "occupied") {
      throw ApiError.badRequest("This bed is occupied. Check the student out (or transfer them) before changing its status");
    }
  }
  if (!existing && body.status === undefined) body.status = "available";

  (req as any).__bedOldRoomId = existing ? Number(existing.roomId) : null;
  body.roomId = roomId; body.bedNo = bedNo; body.branchId = branchId;
  return body;
};

/**
 * Keep the room's physical bed inventory aligned with its configured capacity.
 *
 * A room capacity is the maximum number of beds. For new rooms (and when
 * capacity is increased) we provision missing beds as B1, B2, ... Bn.
 * Existing/manual bed names are preserved; we only add the missing numbered
 * beds needed to reach the requested capacity.
 */
async function ensureRoomBeds(row: Room): Promise<void> {
  const capacity = Number(row.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) return;

  const existing = await Bed.findAll({
    where: { roomId: row.id },
    attributes: ["id", "bedNo"],
  });
  const existingNames = new Set(existing.map((b) => String(b.bedNo).trim().toLowerCase()));

  const missing: Array<{ roomId: number; branchId: number | null; bedNo: string; status: string }> = [];
  for (let i = 1; existing.length + missing.length < capacity; i += 1) {
    const bedNo = `B${i}`;
    if (existingNames.has(bedNo.toLowerCase())) continue;
    missing.push({
      roomId: Number(row.id),
      branchId: row.branchId ?? null,
      bedNo,
      status: "available",
    });
  }

  if (missing.length) await Bed.bulkCreate(missing as any[]);
}
 
export const HOSTEL_RESOURCES: ResourceDefinition[] = [
  {
    path: "hostels", model: Hostel, searchable: ["name", "wardenName"], permission: "hostels",
    includes: [{ association: "rooms", attributes: ["id", "roomNo", "capacity"], include: [{ association: "beds", attributes: ["id", "status"] }] }],
    beforeCreate: validateHostel, beforeUpdate: validateHostel,
    beforeRemove: async (req) => {
      const hostel = await Hostel.findByPk(Number(req.params.id));
      if (!hostel || (req.user?.branchId != null && Number(hostel.branchId) !== Number(req.user.branchId))) {
        throw ApiError.notFound("Hostel not found or outside your branch");
      }
      const roomCount = await Room.count({ where: { hostelId: hostel.id } });
      if (roomCount > 0) throw ApiError.badRequest("This hostel still has rooms. Delete its rooms first (or just mark the hostel inactive).");
      if ((await HostelAllocation.count({ where: { hostelId: hostel.id } })) > 0) {
        throw ApiError.badRequest("This hostel has allocation history and cannot be deleted. Mark it inactive instead.");
      }
    },
    decorate: (row) => {
      const p = plain(row);
      const rooms = Array.isArray(p.rooms) ? p.rooms : [];
      const beds = rooms.flatMap((room: any) => (Array.isArray(room.beds) ? room.beds : []));
      p.roomCount = rooms.length;
      p.totalBeds = beds.length;
      p.occupiedBeds = beds.filter((b: any) => b.status === "occupied").length;
      p.availableBeds = beds.filter((b: any) => b.status === "available").length;
      p.capacity = p.totalBeds;
      p.occupancy = p.totalBeds ? `${p.occupiedBeds} / ${p.totalBeds}` : "No beds yet";
      return p;
    },
  },
  {
    path: "rooms", model: Room, searchable: ["roomNo", "floor"], permission: "rooms",
    includes: [{ association: "hostel", attributes: ["id", "name"] }, { association: "beds", attributes: ["id", "status"] }],
    beforeCreate: validateRoom, beforeUpdate: validateRoom,
    afterCreate: async (row) => {
      await ensureRoomBeds(row);
      await syncRoom(Number(row.id));
    },
    afterUpdate: async (row) => {
      await ensureRoomBeds(row);
      await syncRoom(Number(row.id));
    },
    beforeRemove: async (req) => {
      const room = await Room.findByPk(Number(req.params.id));
      if (!room || (req.user?.branchId != null && Number(room.branchId) !== Number(req.user.branchId))) {
        throw ApiError.notFound("Room not found or outside your branch");
      }
      const bedCount = await Bed.count({ where: { roomId: room.id } });
      if (bedCount > 0) throw ApiError.badRequest("This room still has beds. Delete its beds first.");
    },
    decorate: (row) => {
      const p = plain(row);
      p.hostelName = p.hostel?.name ?? "";
      const beds = Array.isArray(p.beds) ? p.beds : [];
      p.bedCount = beds.length;
      p.availableBeds = beds.filter((b: any) => b.status === "available").length;
      p.occupiedBeds = beds.filter((b: any) => b.status === "occupied").length;
      // p.status is the stored (synced) status, so "maintenance" is preserved.
      p.roomLabel = `Room ${p.roomNo} — ${p.hostelName}`;
      return p;
    },
  },
  {
    path: "beds", model: Bed, searchable: ["bedNo"], permission: "beds",
    includes: [{
      association: "room",
      attributes: ["id", "roomNo", "hostelId", "status"],
      include: [{ association: "hostel", attributes: ["id", "name", "gender"] }],
    }],
    beforeCreate: validateBed, beforeUpdate: validateBed,
    afterCreate: async (row) => { await syncRoom(Number(row.roomId)); },
    afterUpdate: async (row, req) => {
      await syncRoom(Number(row.roomId));
      const old = (req as any).__bedOldRoomId;
      if (old && old !== Number(row.roomId)) await syncRoom(old);
    },
    beforeRemove: async (req) => {
      const bed = await Bed.findByPk(Number(req.params.id));
      if (!bed || (req.user?.branchId != null && Number(bed.branchId) !== Number(req.user.branchId))) {
        throw ApiError.notFound("Bed not found or outside your branch");
      }
      if (bed.status === "occupied") throw ApiError.badRequest("Cannot delete an occupied bed");
      if ((await HostelAllocation.count({ where: { bedId: bed.id } })) > 0) {
        throw ApiError.badRequest("This bed has allocation history and cannot be deleted. Mark it as under maintenance instead.");
      }
    },
    afterRemove: async (row) => { await syncRoom(Number(row.roomId)); },
    decorate: (row) => {
      const p = plain(row);
      p.roomNo = p.room?.roomNo ?? "";
      p.hostelId = p.room?.hostelId ?? p.room?.hostel?.id ?? null;
      p.hostelName = p.room?.hostel?.name ?? "";
      p.hostelGender = p.room?.hostel?.gender ?? "";
      p.bedLabel = `Bed ${p.bedNo} — Room ${p.roomNo} — ${p.hostelName}`;
      return p;
    },
  },
];

