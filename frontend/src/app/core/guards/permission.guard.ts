import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { PermissionService } from '../services/permission.service';

@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly perms: PermissionService,
    private readonly router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const required: string = route.data['permission'] ?? '';
    if (!required) return true;
    if (this.perms.hasPermission(required)) return true;
    return this.router.createUrlTree(['/forbidden']) as unknown as boolean;
  }
}