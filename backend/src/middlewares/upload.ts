import multer from "multer";
import path from "path";
import fs from "fs";
import env from "../config";
import { ApiError } from "../utils/ApiError";
import { v4 as uuidv4 } from "uuid";

const root = path.resolve(process.cwd());
const uploadRoot = path.isAbsolute(env.uploadDir)
  ? env.uploadDir
  : path.join(root, env.uploadDir);

if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${uuidv4()}${ext}`);
  },
});

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "text/plain",
]);

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest("Unsupported file type") as any);
  },
});

export const uploadSingle = (field: string) => upload.single(field);
export const uploadMultiple = (field: string, max = 5) => upload.array(field, max);
export const UPLOAD_ROOT = uploadRoot;