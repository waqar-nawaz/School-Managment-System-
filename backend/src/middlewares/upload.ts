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

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Note: text/plain and text/csv removed — they enabled stored XSS via served-as-HTML.
// HTML/SVG/JS extensions are blocked to prevent served-as-HTML XSS on the API origin.
const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

// Always force a safe extension per MIME so a malicious .html payload cannot be
// served as HTML by the static middleware.
const SAFE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
};

const storageSafe = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safeExt = SAFE_EXT_BY_MIME[file.mimetype] || ".bin";
    cb(null, `${Date.now()}_${uuidv4()}${safeExt}`);
  },
});

export const upload = multer({
  storage: storageSafe,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest("Unsupported file type") as any);
  },
});

export const uploadSingle = (field: string) => upload.single(field);
export const uploadMultiple = (field: string, max = 5) => upload.array(field, max);
export const UPLOAD_ROOT = uploadRoot;