import bcrypt from "bcryptjs";

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, 10);

export const comparePassword = (
  plain: string,
  hashed: string
): Promise<boolean> => bcrypt.compare(plain, hashed);

export const generateRandomPassword = (length = 10): string => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  require("crypto").webcrypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (b, i) => (i < 4 ? chars[b % 10] : chars[b % chars.length])
  ).join("");
};