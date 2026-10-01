export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  gender?: string;
  phone?: string;
  avatar?: string;
  role: string;
  locale?: string;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: string;
  branchId?: number | null;
  /** Live permission list for the user's role (from the server; supports custom roles). */
  permissions?: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}