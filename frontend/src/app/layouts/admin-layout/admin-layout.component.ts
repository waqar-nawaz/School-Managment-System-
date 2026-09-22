import { Component } from '@angular/core';
import { RouterOutlet, Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { filter } from 'rxjs/operators';
import { MENU } from '../../config/menu';
import { PermissionService } from '../../core/services/permission.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AsyncPipe],
  template: `
    <div class="admin-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <span class="brand-badge">🏫</span>
          <span>EduSuite</span>
        </div>
        <nav class="sidebar-nav">
          @for (group of visibleGroups; track group.name) {
            <div class="sidebar-group">{{ group.name }}</div>
            @for (item of group.items; track item.path) {
              <a
                class="sidebar-link"
                [routerLink]="item.path"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: item.path === '/dashboard' }">
                <span class="sidebar-icon">{{ item.icon }}</span>
                {{ item.label }}
              </a>
            }
          }
        </nav>
      </aside>

      <div class="admin-main">
        <header class="topbar">
          <div class="topbar-title">{{ pageTitle }}</div>
          <div class="topbar-actions">
            <span class="topbar-user">{{ userLabel }}</span>
            <button class="btn btn-sm btn-ghost" (click)="logout()">Logout</button>
          </div>
        </header>
        <main class="admin-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AdminLayoutComponent {
  private readonly groups: Array<{ name: string; items: typeof MENU }> = [];
  private readonly groupOrder: string[] = [];

  pageTitle = 'Dashboard';

  constructor(
    private readonly perms: PermissionService,
    private readonly auth: AuthService,
    private readonly router: Router
  ) {
    for (const item of MENU) {
      if (item.permission && !this.perms.hasPermission(item.permission)) continue;
      let group = this.groups.find((g) => g.name === (item.group ?? 'Other'));
      if (!group) {
        group = { name: item.group ?? 'Other', items: [] };
        this.groups.push(group);
        this.groupOrder.push(group.name);
      }
      group.items.push(item);
    }
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      const segments = this.router.url.split('?')[0].split('/').filter(Boolean);
      this.pageTitle = this.titleFromPath(segments[segments.length - 1] ?? '');
    });
  }

  get visibleGroups(): typeof this.groups {
    return this.groups;
  }

  get userLabel(): string {
    const u = this.auth.user;
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : '…';
  }

  private titleFromPath(segment: string): string {
    const hit = MENU.find((m) => m.path === `/${segment}`);
    return hit ? hit.label : segment.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }

  logout(): void {
    this.auth.logout();
  }
}