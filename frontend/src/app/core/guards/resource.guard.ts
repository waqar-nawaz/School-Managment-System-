import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { MENU } from '../../config/menu';
import { PermissionService } from '../services/permission.service';

/**
 * Guards the generic /:resource catch-all. The permission comes from the menu entry of that
 * path, so typing a URL by hand can no longer open a screen the menu hides.
 */
@Injectable({ providedIn: 'root' })
export class ResourceGuard implements CanActivate {
  constructor(private readonly perms: PermissionService, private readonly router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const key = route.paramMap.get('resource') ?? '';
    const entry = MENU.find((m) => m.path === `/${key}`);
    if (!entry) return this.router.createUrlTree(['/not-found']);
    if (entry.permission && !this.perms.hasPermission(entry.permission)) {
      return this.router.createUrlTree(['/forbidden']);
    }
    return true;
  }
}
