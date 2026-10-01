/** Transport routes, vehicles and student transport */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Student,
  Route,
  RouteStop,
  Vehicle,
  DriverAssignment,
  StudentTransport,
  User,
} from "../../../models";
import { ResourceDefinition, getExisting } from "./shared";

const validateRoute = async (body: any, req: Request) => {
  const existing = await getExisting(Route, req);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!name) throw ApiError.badRequest("Route name is required");
  if (name.length > 120) throw ApiError.badRequest("Route name must be 120 characters or fewer");
  const monthlyFee = Number(body.monthlyFee ?? existing?.monthlyFee ?? 0);
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0) throw ApiError.badRequest("monthlyFee must be non-negative");
  const startPoint = String(body.startPoint ?? existing?.startPoint ?? "").trim();
  const endPoint = String(body.endPoint ?? existing?.endPoint ?? "").trim();
  const description = body.description !== undefined ? String(body.description ?? "").trim() : existing?.description;
  if (startPoint.length > 120 || endPoint.length > 120) throw ApiError.badRequest("Route points must be 120 characters or fewer");
  if (description != null && String(description).length > 2000) throw ApiError.badRequest("Route description is too long");
  const duplicate = await Route.findOne({ where: { branchId, name, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Route already exists in this branch");
  body.name = name; body.startPoint = startPoint; body.endPoint = endPoint; body.description = description ?? null;
  body.monthlyFee = monthlyFee; body.isActive = body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing?.isActive ?? true); body.branchId = branchId;
  return body;
};

const validateRouteStop = async (body: any, req: Request) => {
  const existing = await getExisting(RouteStop, req);
  const branchId = Number(req.user?.branchId);
  const routeId = Number(body.routeId ?? existing?.routeId);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const orderIndex = Number(body.orderIndex ?? existing?.orderIndex);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (!Number.isInteger(routeId) || routeId <= 0 || !name) throw ApiError.badRequest("routeId and name are required");
  if (!Number.isInteger(orderIndex) || orderIndex < 0) throw ApiError.badRequest("orderIndex must be non-negative");
  if (name.length > 180) throw ApiError.badRequest("Stop name must be 180 characters or fewer");
  const route = await Route.findOne({ where: { id: routeId, branchId } });
  if (!route || !route.isActive) throw ApiError.badRequest("Route not found, inactive, or outside your branch");
  const sameOrder = await RouteStop.findOne({ where: { routeId, branchId, orderIndex, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (sameOrder) throw ApiError.badRequest("Another stop already uses this order");
  for (const field of ["pickupTime", "dropTime"]) {
    const value = body[field] !== undefined ? body[field] : existing?.[field];
    if (value != null && value !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) throw ApiError.badRequest(field + " must be HH:mm");
    if (value != null) body[field] = String(value);
  }
  const pickup = body.pickupTime ?? existing?.pickupTime;
  const drop = body.dropTime ?? existing?.dropTime;
  if (pickup && drop && String(drop) <= String(pickup)) throw ApiError.badRequest("dropTime must be after pickupTime");
  const stopFee = Number(body.stopFee ?? existing?.stopFee ?? 0);
  if (!Number.isFinite(stopFee) || stopFee < 0) throw ApiError.badRequest("stopFee must be non-negative");
  body.routeId = routeId; body.name = name; body.orderIndex = orderIndex; body.stopFee = stopFee; body.branchId = branchId;
  return body;
};

const validateVehicle = async (body: any, req: Request) => {
  const existing = await getExisting(Vehicle, req);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  const registrationNo = String(body.registrationNo ?? existing?.registrationNo ?? "").trim();
  if (!registrationNo) throw ApiError.badRequest("registrationNo is required");
  const capacity = Number(body.capacity ?? existing?.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) throw ApiError.badRequest("capacity must be positive");
  const status = String(body.status ?? existing?.status ?? "active").trim().toLowerCase();
  if (!["active","maintenance","inactive"].includes(status)) throw ApiError.badRequest("Invalid vehicle status");
  const fuelType = String(body.fuelType ?? existing?.fuelType ?? "").trim().toLowerCase();
  if (fuelType && !["petrol","diesel","cng","electric"].includes(fuelType)) throw ApiError.badRequest("Invalid vehicle fuel type");
  const duplicate = await Vehicle.findOne({ where: { registrationNo, branchId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Vehicle registration number already exists in this branch");
  for (const field of ["insuranceExpiry", "fitnessExpiry"]) {
    if (body[field] !== undefined) {
      if (body[field] === null || body[field] === "") {
        body[field] = null;
      } else {
        const date = new Date(body[field]);
        if (!Number.isFinite(date.getTime())) throw ApiError.badRequest("Invalid vehicle expiry date");
        body[field] = date;
      }
    } else if (existing?.[field]) {
      const date = new Date(existing[field]);
      if (!Number.isFinite(date.getTime())) throw ApiError.badRequest("Invalid vehicle expiry date");
      body[field] = date;
    }
  }
  body.registrationNo = registrationNo; body.capacity = capacity; body.fuelType = fuelType || null; body.status = status; body.branchId = branchId;
  return body;
};

export const TRANSPORT_RESOURCES: ResourceDefinition[] = [
  { path: "routes", model: Route, searchable: ["name", "startPoint", "endPoint"], permission: "routes", beforeCreate: validateRoute, beforeUpdate: validateRoute },
  { path: "route-stops", model: RouteStop, searchable: ["name"], permission: "route-stops", beforeCreate: validateRouteStop, beforeUpdate: validateRouteStop },
  { path: "vehicles", model: Vehicle, searchable: ["registrationNo", "model"], permission: "vehicles", beforeCreate: validateVehicle, beforeUpdate: validateVehicle },
  {
    path: "driver-assignments", model: DriverAssignment, searchable: [], permission: "driver-assignments",
    beforeCreate: async (body, req) => {
      const branchId = Number(req.user?.branchId);
      const vehicleId = Number(body.vehicleId);
      const driverId = Number(body.driverId);
      if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
      if (!Number.isInteger(vehicleId) || !Number.isInteger(driverId)) throw ApiError.badRequest("vehicleId and driverId are required");
      const vehicle = await Vehicle.findOne({ where: { id: vehicleId, branchId } });
      const driver = await User.findOne({ where: { id: driverId, branchId } });
      if (!vehicle) throw ApiError.badRequest("Vehicle not found or outside your branch");
      if (vehicle.status !== "active") throw ApiError.badRequest("Selected vehicle is not active");
      if (!driver || !driver.isActive) throw ApiError.badRequest("Driver is not active or outside your branch");
      const routeId = body.routeId ? Number(body.routeId) : null;
      if (routeId) {
        const route = await Route.findOne({ where: { id: routeId, branchId } });
        if (!route || !route.isActive) throw ApiError.badRequest("Route not found, inactive, or outside your branch");
      }
      if (await DriverAssignment.findOne({ where: { vehicleId, branchId, isActive: true } })) throw ApiError.badRequest("Vehicle already has an active driver");
      if (await DriverAssignment.findOne({ where: { driverId, branchId, isActive: true } })) throw ApiError.badRequest("Driver already has an active vehicle");
      const assignedOn = body.assignedOn ? new Date(body.assignedOn) : new Date();
      if (!Number.isFinite(assignedOn.getTime())) throw ApiError.badRequest("Invalid assignedOn date");
      body.vehicleId = vehicleId; body.driverId = driverId; body.routeId = routeId; body.assignedOn = assignedOn; body.isActive = body.isActive !== false; body.branchId = branchId;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const branchId = Number(req.user?.branchId);
      const current = await DriverAssignment.findByPk(id);
      if (!current || Number(current.branchId) !== branchId) throw ApiError.badRequest("Driver assignment not found or outside your branch");
      const vehicleId = Number(body.vehicleId ?? current.vehicleId);
      const driverId = Number(body.driverId ?? current.driverId);
      const vehicle = await Vehicle.findOne({ where: { id: vehicleId, branchId } });
      const driver = await User.findOne({ where: { id: driverId, branchId } });
      if (!vehicle || vehicle.status !== "active") throw ApiError.badRequest("Selected vehicle is not active or outside your branch");
      if (!driver || !driver.isActive) throw ApiError.badRequest("Driver is not active or outside your branch");
      const routeId = body.routeId !== undefined ? (body.routeId ? Number(body.routeId) : null) : (current.routeId ?? null);
      if (routeId) {
        const route = await Route.findOne({ where: { id: routeId, branchId } });
        if (!route || !route.isActive) throw ApiError.badRequest("Route not found, inactive, or outside your branch");
      }
      const active = body.isActive !== undefined ? Boolean(body.isActive) : current.isActive;
      if (active) {
        if (await DriverAssignment.findOne({ where: { vehicleId, branchId, isActive: true, id: { [Op.ne]: id } } })) throw ApiError.badRequest("Vehicle already has another active driver");
        if (await DriverAssignment.findOne({ where: { driverId, branchId, isActive: true, id: { [Op.ne]: id } } })) throw ApiError.badRequest("Driver already has another active vehicle");
      }
      const assignedOn = body.assignedOn !== undefined ? new Date(body.assignedOn) : new Date(current.assignedOn);
      if (!Number.isFinite(assignedOn.getTime())) throw ApiError.badRequest("Invalid assignedOn date");
      body.vehicleId = vehicleId; body.driverId = driverId; body.routeId = routeId; body.assignedOn = assignedOn; body.isActive = active; body.branchId = branchId;
      return body;
    },
  },
  {
    path: "student-transport", model: StudentTransport, searchable: [], permission: "student-transport",
    beforeCreate: async (body, req) => {
      const student = await Student.findByPk(body.studentId);
      if (!student) throw ApiError.badRequest("Student not found");
      if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
        throw ApiError.badRequest("Selected student does not belong to your branch");
      }
      const route = await Route.findByPk(body.routeId);
      if (!route || !route.isActive) throw ApiError.badRequest("Selected route is not active");
      if (req.user?.branchId != null && Number(route.branchId) !== Number(req.user.branchId)) {
        throw ApiError.badRequest("Selected route does not belong to your branch");
      }
      if (body.stopId) {
        const stop = await RouteStop.findByPk(body.stopId);
        if (!stop || Number(stop.routeId) !== Number(body.routeId)) throw ApiError.badRequest("Selected stop does not belong to the selected route");
      }
      if (body.vehicleId) {
        const vehicle = await Vehicle.findByPk(body.vehicleId);
        if (!vehicle || vehicle.status !== "active") throw ApiError.badRequest("Selected vehicle is not active");
      }
      const active = await StudentTransport.findOne({ where: { studentId: body.studentId, isActive: true } });
      if (active) throw ApiError.badRequest("Student already has an active transport assignment");
      const start = body.startDate ? new Date(body.startDate) : new Date();
      const end = body.endDate ? new Date(body.endDate) : null;
      if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end < start))) {
        throw ApiError.badRequest("Invalid transport date range");
      }
      body.startDate = start;
      body.endDate = end;
      body.isActive = true;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await StudentTransport.findByPk(id);
      if (!current) throw ApiError.badRequest("Student transport assignment not found");
      const studentId = body.studentId ?? current.studentId;
      const routeId = body.routeId ?? current.routeId;
      const student = await Student.findByPk(studentId);
      const route = await Route.findByPk(routeId);
      if (!student || !route) throw ApiError.badRequest("Student or route not found");
      if (req.user?.branchId != null && (Number(student.branchId) !== Number(req.user.branchId) || Number(route.branchId) !== Number(req.user.branchId))) {
        throw ApiError.badRequest("Student or route does not belong to your branch");
      }
      if (body.stopId) {
        const stop = await RouteStop.findByPk(body.stopId);
        if (!stop || Number(stop.routeId) !== Number(routeId)) throw ApiError.badRequest("Selected stop does not belong to the selected route");
      }
      if (body.vehicleId) {
        const vehicle = await Vehicle.findByPk(body.vehicleId);
        if (!vehicle || vehicle.status !== "active") throw ApiError.badRequest("Selected vehicle is not active");
      }
      const nextActive = body.isActive !== undefined ? Boolean(body.isActive) : current.isActive;
      if (nextActive) {
        const duplicate = await StudentTransport.findOne({ where: { studentId, isActive: true, id: { [Op.ne]: id } } });
        if (duplicate) throw ApiError.badRequest("Student already has another active transport assignment");
      }
      const start = body.startDate !== undefined ? new Date(body.startDate) : new Date(current.startDate);
      const end = body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : (current.endDate ? new Date(current.endDate) : null);
      if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end < start))) throw ApiError.badRequest("Invalid transport date range");
      body.startDate = start;
      body.endDate = end;
      return body;
    },
  },
];
