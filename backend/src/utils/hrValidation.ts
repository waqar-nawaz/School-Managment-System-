import { ApiError } from "./ApiError";

const MAX_FUTURE_HIRE_DAYS = 90;
const MAX_MONTHLY_SALARY = 100_000_000;

/** A joining date a few weeks ahead is normal (onboarding); years ahead or before 1960 is a typo. */
export function assertSaneHireDate(date: Date): void {
  if (date.getTime() > Date.now() + MAX_FUTURE_HIRE_DAYS * 86400000) {
    throw ApiError.badRequest(`Hire date cannot be more than ${MAX_FUTURE_HIRE_DAYS} days in the future`);
  }
  if (date.getUTCFullYear() < 1960) throw ApiError.badRequest("Hire date is not a realistic date");
}

export function assertSaneSalary(amount: number): void {
  if (amount > MAX_MONTHLY_SALARY) throw ApiError.badRequest("Basic salary is unrealistically large; please check the amount");
}
