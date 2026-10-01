import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { ROLE_PERMISSIONS } from '../../config/frontend-permissions';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private readonly auth: AuthService) {}

  get role(): string | null {
    return this.auth.user?.role ?? null;
  }

  /**
   * Uses the permission list the server sent with the user (so the Roles & Permissions screen and
   * custom roles really drive the menus). The bundled map is only a fallback for older responses.
   */
  hasPermission(permission: string): boolean {
    const user = this.auth.user;
    if (!user) return false;
    const perms = user.permissions ?? ROLE_PERMISSIONS[user.role];
    if (!perms) return false;
    return perms.includes('*') || perms.includes(permission);
  }

  hasAny(...permissions: string[]): boolean {
    return permissions.some((p) => this.hasPermission(p));
  }

  isRole(...roles: string[]): boolean {
    const role = this.role;
    return !!role && roles.includes(role);
  }
}
