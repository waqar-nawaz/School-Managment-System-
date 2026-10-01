/** Hostels, rooms, beds and allocations */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Student,
  Hostel,
  Room,
  Bed,
  HostelAllocation,
} from "../../../models";
import { ResourceDefinition, getExisting, plain } from "./shared";

const validateHostel = async (body: any, req: Request) => {
  const existing = await getExisting(Hostel, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const gender = String(body.gender ?? existing?.gender ?? "");
  const branchId = req.user?.branchId;
  if (!name) throw ApiError.badRequest("Hostel name is required");
  if (!["boys", "girls", "coed"].includes(gender)) throw ApiError.badRequest("Invalid hostel gender");
  // Capacity is derived from actual beds; keep the legacy column for compatibility.
  body.name = name; body.gender = gender; body.capacity = existing?.capacity ?? 0; body.branchId = branchId;
  return body;
};

const validateRoom = async (body: any, req: Request) => {
  const existing = await getExisting(Room, req);
  const hostelId = Number(body.hostelId ?? existing?.hostelId);
  const roomNo = String(body.roomNo ?? existing?.roomNo ?? "").trim();
  const capacity = Number(body.capacity ?? existing?.capacity ?? 4);
  const branchId = req.user?.branchId;
  if (!Number.isInteger(hostelId) || hostelId <= 0 || !roomNo) throw ApiError.badRequest("hostelId and roomNo are required");
  if (!Number.isInteger(capacity) || capacity < 1) throw ApiError.badRequest("Room capacity must be positive");
  if (existing) {
    const currentBedCount = await Bed.count({ where: { roomId: existing.id } });
    if (capacity < currentBedCount) throw ApiError.badRequest("Room capacity cannot be less than its existing beds");
  }
  const hostel = await Hostel.findByPk(hostelId);
  if (!hostel || hostel.isActive === false || (branchId != null && Number(hostel.branchId) !== Number(branchId))) {
    throw ApiError.badRequest("Hostel does not belong to your branch or is inactive");
  }
  const duplicate = await Room.findOne({ where: { hostelId, roomNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Room number already exists in this hostel");
  body.hostelId = hostelId; body.roomNo = roomNo; body.capacity = capacity; body.branchId = branchId;
  return body;
};

const validateBed = async (body: any, req: Request) => {
  const existing = await getExisting(Bed, req);
  const roomId = Number(body.roomId ?? existing?.roomId);
  const bedNo = String(body.bedNo ?? existing?.bedNo ?? "").trim();
  const branchId = req.user?.branchId;
  if (!Number.isInteger(roomId) || roomId <= 0 || !bedNo) throw ApiError.badRequest("roomId and bedNo are required");
  const room = await Room.findByPk(roomId);
  if (!room || (branchId != null && Number(room.branchId) !== Number(branchId))) throw ApiError.badRequest("Room does not belong to your branch");
  const hostel = await Hostel.findByPk(room.hostelId);
  if (!hostel || hostel.isActive === false || (branchId != null && Number(hostel.branchId) !== Number(branchId))) {
    throw ApiError.badRequest("Room's hostel is inactive or outside your branch");
  }
  const duplicate = await Bed.findOne({ where: { roomId, bedNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Bed number already exists in this room");
  if (!existing) {
    const bedCount = await Bed.count({ where: { roomId } });
    if (bedCount >= Number(room.capacity)) {
      throw ApiError.badRequest(`Room ${room.roomNo} has reached its capacity of ${room.capacity} beds`);
    }
  }
  body.roomId = roomId; body.bedNo = bedNo; body.branchId = branchId;
  return body;
};

const refreshRoomStatus = async (roomId: number) => {
  const room = await Room.findByPk(roomId);
  if (!room) return;
  const availableBeds = await Bed.count({ where: { roomId, status: "available" } });
  const status = availableBeds === 0 ? "full" : "available";
  if (room.status !== status) await room.update({ status });
};

const validateHostelAllocation = async (body: any, req: Request) => {
  const existing = await getExisting(HostelAllocation, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const requestedHostelId = body.hostelId !== undefined ? Number(body.hostelId) : undefined;
  const requestedRoomId = body.roomId !== undefined ? Number(body.roomId) : undefined;
  const bedId = Number(body.bedId ?? existing?.bedId);
  const branchId = req.user?.branchId;
  const status = String(body.status ?? existing?.status ?? "active");
  const monthlyFee = Number(body.monthlyFee ?? existing?.monthlyFee ?? 0);
  const checkIn = body.checkIn !== undefined ? new Date(body.checkIn) : (existing?.checkIn ? new Date(existing.checkIn) : new Date());
  const checkOut = body.checkOut !== undefined ? (body.checkOut ? new Date(body.checkOut) : null) : (existing?.checkOut ? new Date(existing.checkOut) : null);

  if (!Number.isInteger(studentId) || studentId <= 0 || !Number.isInteger(bedId) || bedId <= 0) throw ApiError.badRequest("studentId and bedId are required");
  if (!["active", "checked_out", "transferred"].includes(status)) throw ApiError.badRequest("Invalid hostel allocation status");
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0) throw ApiError.badRequest("monthlyFee must be non-negative");
  if (!Number.isFinite(checkIn.getTime()) || (checkOut && (!Number.isFinite(checkOut.getTime()) || checkOut < checkIn))) throw ApiError.badRequest("Invalid hostel allocation date range");

  const student = await Student.findByPk(studentId);
  if (!student || (branchId != null && Number(student.branchId) !== Number(branchId))) throw ApiError.badRequest("Student does not belong to your branch");

  const bed = await Bed.findByPk(bedId);
  if (!bed || (branchId != null && Number(bed.branchId) !== Number(branchId))) throw ApiError.badRequest("Selected bed does not belong to your branch");
  const changingBed = !existing || Number(existing.bedId) !== bedId;
  if (changingBed && bed.status !== "available") throw ApiError.badRequest("Selected bed is not available");

  const room = await Room.findByPk(bed.roomId);
  if (!room || (branchId != null && Number(room.branchId) !== Number(branchId))) throw ApiError.badRequest("Room does not belong to your branch");
  const hostel = await Hostel.findByPk(room.hostelId);
  if (requestedRoomId !== undefined && requestedRoomId !== room.id) throw ApiError.badRequest("Selected room does not match the selected bed");
  if (requestedHostelId !== undefined && requestedHostelId !== hostel?.id) throw ApiError.badRequest("Selected hostel does not match the selected room");
  if (!hostel || hostel.isActive === false || (branchId != null && Number(hostel.branchId) !== Number(branchId))) throw ApiError.badRequest("Hostel does not belong to your branch or is inactive");

  const activeBed = await HostelAllocation.findOne({ where: { bedId, status: "active", ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (status === "active" && activeBed) throw ApiError.badRequest("Selected bed is already allocated");

  const activeStudent = status === "active"
    ? await HostelAllocation.findOne({ where: { studentId, status: "active", ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } })
    : null;
  if (activeStudent) throw ApiError.badRequest("Student already has an active hostel allocation");

  const previousRoomId = existing && Number(existing.bedId) !== bedId
    ? Number((await Bed.findByPk(existing.bedId))?.roomId ?? 0)
    : 0;
  if (existing && Number(existing.bedId) !== bedId) {
    const previousBed = await Bed.findByPk(existing.bedId);
    if (previousBed && previousBed.status === "occupied") await previousBed.update({ status: "available" });
  }
  await bed.update({ status: status === "active" ? "occupied" : "available" });
  await refreshRoomStatus(room.id);
  if (previousRoomId > 0 && previousRoomId !== room.id) await refreshRoomStatus(previousRoomId);

  body.studentId = studentId; body.bedId = bedId; body.roomId = room.id; body.hostelId = hostel.id;
  body.status = status; body.monthlyFee = monthlyFee; body.checkIn = checkIn; body.checkOut = checkOut; body.branchId = branchId;
  return body;
};

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
      if (roomCount > 0) throw ApiError.badRequest("Cannot delete a hostel that still has rooms");
    },
    decorate: (row) => {
      const p = plain(row);
      const rooms = Array.isArray(p.rooms) ? p.rooms : [];
      const totalBeds = rooms.reduce((n: number, room: any) => n + (Array.isArray(room.beds) ? room.beds.length : 0), 0);
      const occupiedBeds = rooms.reduce((n: number, room: any) => n + (Array.isArray(room.beds) ? room.beds.filter((b: any) => b.status === "occupied").length : 0), 0);
      const availableBeds = rooms.reduce((n: number, room: any) => n + (Array.isArray(room.beds) ? room.beds.filter((b: any) => b.status === "available").length : 0), 0);
      p.roomCount = rooms.length;
      p.totalBeds = totalBeds;
      p.occupiedBeds = occupiedBeds;
      p.availableBeds = availableBeds;
      p.capacity = totalBeds;
      return p;
    },
  },
  {
    path: "rooms", model: Room, searchable: ["roomNo", "floor"], permission: "rooms",
    includes: [{ association: "hostel", attributes: ["id", "name"] }, { association: "beds", attributes: ["id", "status"] }],
    beforeCreate: validateRoom, beforeUpdate: validateRoom,
    beforeRemove: async (req) => {
      const room = await Room.findByPk(Number(req.params.id));
      if (!room || (req.user?.branchId != null && Number(room.branchId) !== Number(req.user.branchId))) {
        throw ApiError.notFound("Room not found or outside your branch");
      }
      const bedCount = await Bed.count({ where: { roomId: room.id } });
      if (bedCount > 0) throw ApiError.badRequest("Cannot delete a room that still has beds");
    },
    decorate: (row) => {
      const p = plain(row);
      p.hostelName = p.hostel?.name ?? "";
      const beds = Array.isArray(p.beds) ? p.beds : [];
      p.bedCount = beds.length;
      p.availableBeds = beds.filter((b: any) => b.status === "available").length;
      p.occupiedBeds = beds.filter((b: any) => b.status === "occupied").length;
      p.status = p.availableBeds === 0 ? "full" : "available";
      p.roomLabel = `Room ${p.roomNo} — ${p.hostelName}`;
      return p;
    },
  },
  {
    path: "beds", model: Bed, searchable: ["bedNo"], permission: "beds",
    includes: [{
      association: "room",
      attributes: ["id", "roomNo"],
      include: [{ association: "hostel", attributes: ["id", "name"] }],
    }],
    beforeCreate: async (body, req) => {
      const result = await validateBed(body, req);
      await refreshRoomStatus(Number(result.roomId));
      return result;
    },
    beforeUpdate: async (body, req) => {
      const result = await validateBed(body, req);
      await refreshRoomStatus(Number(result.roomId));
      return result;
    },
    beforeRemove: async (req) => {
      const bed = await Bed.findByPk(Number(req.params.id));
      if (!bed || (req.user?.branchId != null && Number(bed.branchId) !== Number(req.user.branchId))) {
        throw ApiError.notFound("Bed not found or outside your branch");
      }
      if (bed.status === "occupied") throw ApiError.badRequest("Cannot delete an occupied bed");
      await refreshRoomStatus(Number(bed.roomId));
    },
    decorate: (row) => {
      const p = plain(row);
      p.roomNo = p.room?.roomNo ?? "";
      p.hostelName = p.room?.hostel?.name ?? "";
      p.bedLabel = `Bed ${p.bedNo} — Room ${p.roomNo} — ${p.hostelName}`;
      return p;
    },
  },
  {
    path: "hostel-allocations", model: HostelAllocation, searchable: ["status"], permission: "hostel-allocations",
    includes: [
      { association: "student", attributes: ["id", "firstName", "lastName", "admissionNo"] },
      { association: "hostel", attributes: ["id", "name"] },
      { association: "room", attributes: ["id", "roomNo"] },
      { association: "bed", attributes: ["id", "bedNo"] },
    ],
    decorate: (row) => {
      const p = plain(row);
      p.studentName = p.student ? `${p.student.firstName} ${p.student.lastName}`.trim() : "";
      p.admissionNo = p.student?.admissionNo ?? "";
      p.hostelName = p.hostel?.name ?? "";
      p.roomNo = p.room?.roomNo ?? "";
      p.bedNo = p.bed?.bedNo ?? "";
      return p;
    },
    beforeCreate: validateHostelAllocation,
    beforeUpdate: validateHostelAllocation,
    beforeRemove: async (req) => {
      const allocation = await HostelAllocation.findByPk(Number(req.params.id));
      if (!allocation || (req.user?.branchId != null && Number(allocation.branchId) !== Number(req.user.branchId))) {
        throw ApiError.notFound("Hostel allocation not found or outside your branch");
      }
      const bed = await Bed.findByPk(allocation.bedId);
      if (bed) {
        await bed.update({ status: "available" });
        await refreshRoomStatus(Number(bed.roomId));
      }
    },
  },
];
