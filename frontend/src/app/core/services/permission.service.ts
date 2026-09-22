import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { ROLE_PERMISSIONS } from '../../config/frontend-permissions';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private readonly auth: AuthService) {}

  get role(): string | null {
    return this.auth.user?.role ?? null;
  }

  hasPermission(permission: string): boolean {
    const role = this.role;
    if (!role) return false;
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return false;
    if (perms.includes('*') || perms.includes(permission)) return true;
    return false;
  }

  isRole(...roles: string[]): boolean {
    const role = this.role;
    return !!role && roles.includes(role);
  }
}