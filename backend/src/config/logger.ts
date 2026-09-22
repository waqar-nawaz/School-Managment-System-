import winston from "winston";
import env from "./index";

const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level.toUpperCase()}] ${message}${extra}${stack ? `\n${stack}` : ""}`;
  })
);

export const logger = winston.createLogger({
  level: env.nodeEnv === "production" ? "info" : "debug",
  format,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});