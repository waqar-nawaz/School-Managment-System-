import { Component, HostListener, signal } from '@angular/core';
import { RouterOutlet, Router, RouterLink, RouterLinkActive, NavigationEnd, NavigationStart } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MENU } from '../../config/menu';
import { PermissionService } from '../../core/services/permission.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <div class="admin-shell">
      <header class="mobile-topbar">
        <button class="hamburger" (click)="toggleMenu()" aria-label="Menu">
          <app-icon name="menu" [size]="22" />
        </button>
        <span class="brand">EduSuite</span>
      </header>

      @if (menuOpen) {
        <div class="overlay" (click)="toggleMenu()"></div>
      }

      <aside class="sidebar" [class.open]="menuOpen" [class.collapsed]="isIconOnly()">
        <div class="sidebar-top desktop-only">
          @if (!isIconOnly()) {
            <div class="brand">
              <span class="brand-badge"><app-icon name="graduation" [size]="20" /></span>
              <span>EduSuite</span>
            </div>
          }
          <button
            class="collapse-btn"
            (click)="toggleCollapse()"
            [attr.aria-label]="isIconOnly() ? 'Expand sidebar' : 'Collapse sidebar'">
            <app-icon [name]="isIconOnly() ? 'chevron-right' : 'chevron-left'" [size]="16" />
          </button>
        </div>

        <nav class="sidebar-nav">
          @for (group of visibleGroups; track group.name) {
            @if (!isIconOnly()) {
              <div class="sidebar-group">{{ group.name }}</div>
            }
            @for (item of group.items; track item.path) {
              <a
                class="sidebar-link"
                [routerLink]="item.path"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: item.path === '/dashboard' }"
                [attr.data-label]="item.label">
                <app-icon class="sidebar-icon" [name]="item.icon" [size]="18" />
                @if (!isIconOnly()) {
                  <span>{{ item.label }}</span>
                }
              </a>
            }
          }
        </nav>

        <button class="theme-toggle" (click)="theme.toggle()" data-label="Toggle theme">
          <app-icon [name]="theme.theme() === 'light' ? 'moon' : 'sun'" [size]="18" />
          @if (!isIconOnly()) {
            <span>{{ theme.theme() === 'light' ? 'Dark mode' : 'Light mode' }}</span>
          }
        </button>

        <div class="user-box">
          @if (isIconOnly()) {
            <div class="avatar">{{ userInitial }}</div>
          } @else {
            <div class="name">{{ userLabel }}</div>
            <div class="role">{{ userRole }}</div>
          }
          <button class="logout-btn" (click)="logout()" data-label="Log out">
            <app-icon name="log-out" [size]="18" />
            @if (!isIconOnly()) {
              <span>Log out</span>
            }
          </button>
        </div>
      </aside>

      <div class="admin-main">
        <header class="topbar">
          <div class="topbar-title">{{ pageTitle }}</div>
          <div class="topbar-actions">
            <button
              class="icon-btn"
              (click)="theme.toggle()"
              [attr.aria-label]="theme.theme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'">
              <app-icon [name]="theme.theme() === 'light' ? 'moon' : 'sun'" [size]="17" />
            </button>
          </div>
        </header>
        <main class="admin-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .admin-shell { display: flex; min-height: 100vh; background: var(--bg); }
      .mobile-topbar { display: none; }
      .overlay { display: none; }

      .sidebar {
        width: 248px;
        flex-shrink: 0;
        height: 100vh;
        position: sticky;
        top: 0;
        background: var(--sidebar-bg);
        color: #fff;
        display: flex;
        flex-direction: column;
        padding: 1rem 0.75rem;
        overflow: hidden;
        transition: width 0.2s ease;
      }
      .sidebar-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
      .sidebar .brand { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; font-size: 1.05rem; white-space: nowrap; }
      .sidebar .brand-badge {
        display: inline-grid; place-items: center; width: 32px; height: 32px;
        background: var(--primary); border-radius: 0.5rem; color: #fff; flex-shrink: 0;
      }
      .collapse-btn {
        background: none; border: 1px solid rgba(255, 255, 255, 0.15); color: #b8c6d6;
        border-radius: 6px; padding: 0.3rem; cursor: pointer; display: flex; align-items: center;
        justify-content: center; flex-shrink: 0;
      }
      .collapse-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }

      .sidebar-nav {
        display: flex; flex-direction: column; gap: 0.15rem; flex: 1;
        overflow-y: auto; overflow-x: hidden; min-height: 0;
        scrollbar-width: none; -ms-overflow-style: none;
      }
      .sidebar-nav::-webkit-scrollbar { display: none; width: 0; height: 0; }
      .sidebar-group {
        font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em;
        color: #64748b; padding: 0.85rem 0.65rem 0.3rem; font-weight: 700;
      }
      .sidebar-link {
        display: flex; align-items: center; gap: 0.65rem; color: #b8c6d6; text-decoration: none;
        padding: 0.55rem 0.7rem; border-radius: 6px; font-size: 0.9rem; white-space: nowrap;
        position: relative; font-weight: 500;
      }
      .sidebar-link:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
      .sidebar-link.active { background: var(--sidebar-active); color: #fff; }
      .sidebar-icon { flex-shrink: 0; }

      .theme-toggle {
        display: flex; align-items: center; gap: 0.65rem; background: none;
        border: 1px solid rgba(255, 255, 255, 0.1); color: #b8c6d6; padding: 0.55rem 0.7rem;
        border-radius: 6px; font-size: 0.85rem; cursor: pointer; margin-top: 0.75rem;
        white-space: nowrap; position: relative; font-family: inherit; font-weight: 500;
      }
      .theme-toggle:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }

      .user-box {
        border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 0.85rem; margin-top: 0.75rem;
        font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.5rem;
      }
      .user-box .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .user-box .role { color: #8a9bb0; text-transform: capitalize; }
      .user-box .avatar {
        width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: #fff;
        display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto;
      }
      .logout-btn {
        display: flex; align-items: center; gap: 0.65rem; width: 100%; background: transparent;
        border: 1px solid #35516b; color: #cfd9e3; padding: 0.45rem 0.6rem; border-radius: 6px;
        cursor: pointer; font-size: 0.78rem; white-space: nowrap; position: relative; font-family: inherit;
      }
      .logout-btn:hover { background: #16334a; }

      .sidebar.collapsed { width: 68px; }
      .sidebar.collapsed .sidebar-link,
      .sidebar.collapsed .theme-toggle,
      .sidebar.collapsed .logout-btn { justify-content: center; padding: 0.6rem; }
      .sidebar.collapsed .user-box { align-items: center; }
      .sidebar.collapsed .sidebar-link:hover::after,
      .sidebar.collapsed .theme-toggle:hover::after,
      .sidebar.collapsed .logout-btn:hover::after,
      .sidebar.collapsed .collapse-btn:hover::after {
        content: attr(data-label); position: absolute; left: 100%; top: 50%; transform: translateY(-50%);
        margin-left: 0.6rem; background: #1c2733; color: #fff; padding: 0.35rem 0.65rem; border-radius: 6px;
        font-size: 0.78rem; white-space: nowrap; z-index: 200; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      }

      .admin-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .topbar {
        height: 58px; background: var(--surface); border-bottom: 1px solid var(--border);
        display: flex; align-items: center; justify-content: space-between; padding: 0 1.25rem;
        position: sticky; top: 0; z-index: 10;
      }
      .topbar-title { font-weight: 800; font-size: 1rem; color: var(--heading); }
      .topbar-actions { display: flex; align-items: center; gap: 0.6rem; }
      .topbar-user { color: var(--text-muted); font-size: 0.9rem; }
      .admin-content { flex: 1; padding: 1.5rem; }

      @media (max-width: 860px) {
        .admin-shell { flex-direction: column; }
        .mobile-topbar {
          display: flex; align-items: center; gap: 0.75rem; background: var(--sidebar-bg); color: #fff;
          padding: 0.75rem 1rem; position: sticky; top: 0; z-index: 30;
        }
        .mobile-topbar .hamburger {
          background: none; border: none; color: #fff; cursor: pointer; padding: 0.1rem;
          display: inline-flex;
        }
        .mobile-topbar .brand { font-size: 1.05rem; font-weight: 600; }
        .sidebar .desktop-only { display: none; }
        .overlay { display: block; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 40; }
        .sidebar {
          position: fixed; top: 0; left: 0; bottom: 0; width: 250px !important;
          transform: translateX(-100%); transition: transform 0.22s ease; z-index: 50; padding-top: 4.5rem;
        }
        .sidebar.open { transform: translateX(0); }
        .sidebar.collapsed .sidebar-link,
        .sidebar.collapsed .theme-toggle,
        .sidebar.collapsed .logout-btn { justify-content: flex-start; padding: 0.55rem 0.7rem; }
        .admin-content { padding: 1rem; }
      }
    `,
  ],
})
export class AdminLayoutComponent {
  private readonly groups: Array<{ name: string; items: typeof MENU }> = [];

  pageTitle = 'Dashboard';
  menuOpen = false;
  collapsed = signal(localStorage.getItem('sms_sidebar_collapsed') === 'true');
  isMobile = signal(typeof window !== 'undefined' && window.innerWidth <= 860);

  constructor(
    public readonly theme: ThemeService,
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
      }
      group.items.push(item);
    }
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      const segments = this.router.url.split('?')[0].split('/').filter(Boolean);
      this.pageTitle = this.titleFromPath(segments[segments.length - 1] ?? '');
    });
    this.router.events.pipe(filter((e) => e instanceof NavigationStart)).subscribe(() => {
      this.menuOpen = false;
    });
  }

  get visibleGroups(): typeof this.groups {
    return this.groups;
  }

  get userLabel(): string {
    const u = this.auth.user;
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : '…';
  }

  get userRole(): string {
    return this.auth.user?.role?.replace(/_/g, ' ') ?? '';
  }

  get userInitial(): string {
    const u = this.auth.user;
    return (u?.firstName?.[0] ?? u?.email?.[0] ?? '?').toUpperCase();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile.set(window.innerWidth <= 860);
  }

  isIconOnly(): boolean {
    return this.collapsed() && !this.isMobile();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  toggleCollapse(): void {
    this.collapsed.update((v) => !v);
    localStorage.setItem('sms_sidebar_collapsed', String(this.collapsed()));
  }

  private titleFromPath(segment: string): string {
    const hit = MENU.find((m) => m.path === `/${segment}`);
    return hit ? hit.label : segment.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }

  logout(): void {
    this.auth.logout();
  }
}
