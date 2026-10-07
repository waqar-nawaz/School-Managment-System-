import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface PermissionRow {
  key: string;
  label?: string;
  category?: string;
}

interface Group { name: string; keys: PermissionRow[] }

/** Map a permission category to an icon name (mirrors the menu and roles tab). */
const CATEGORY_ICON: Record<string, string> = {
  dashboard: 'dashboard', admissions: 'clipboard', students: 'users', teachers: 'user-check',
  staff: 'briefcase', classes: 'home', sections: 'layers', subjects: 'book',
  academic: 'calendar', attendance: 'check-square', exams: 'file-text',
  'exam-results': 'award', 'report-cards': 'file-text', assignments: 'clipboard',
  submissions: 'clipboard', gradebook: 'trending-up', timetable: 'clock',
  syllabus: 'list', 'lesson-plans': 'folder', leaves: 'clock',
  fees: 'dollar', invoices: 'file-text', payments: 'credit-card',
  expenses: 'trending-down', payroll: 'dollar', payslips: 'file-text',
  library: 'book', 'book-issues': 'bookmark', 'book-fines': 'scale',
  routes: 'map', 'route-stops': 'map-pin', vehicles: 'truck',
  'student-transport': 'map-pin', 'driver-assignments': 'user-check',
  hostels: 'bed', rooms: 'dashboard', beds: 'bed',
  'hostel-allocations': 'clipboard',
  events: 'calendar', notices: 'bell', announcements: 'megaphone',
  messages: 'mail', notifications: 'bell', complaints: 'message',
  certificates: 'award', 'health-records': 'heart', 'discipline-records': 'alert',
  inventory: 'package', assets: 'monitor', media: 'image', visitors: 'clipboard',
  users: 'user', roles: 'shield', permissions: 'lock', 'audit-logs': 'search',
  settings: 'settings', reports: 'bar-chart', branches: 'home',
  receipts: 'file-text', refunds: 'trending-down', system: 'shield',
};

@Component({
  selector: 'app-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Permissions</h1>
        <p class="page-subtitle">All permission keys defined in the system. Add custom keys for fine-grained access control.</p>
      </div>
      @if (canCreate) {
        <div class="page-actions">
          <button class="btn btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="15" /> Add permission</button>
        </div>
      }
    </div>

    <div class="perm-summary">
      <div class="summary-tile summary-tile-primary">
        <span class="summary-icon"><app-icon name="lock" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ total }}</strong><small>Permission keys</small></div>
      </div>
      <div class="summary-tile summary-tile-info">
        <span class="summary-icon"><app-icon name="layers" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ groups().length }}</strong><small>Categories</small></div>
      </div>
      <div class="summary-tile summary-tile-success">
        <span class="summary-icon"><app-icon name="shield" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ largestGroupName() | titlecase }}</strong>
          <small>Largest category ({{ largestGroupCount() }})</small>
        </div>
      </div>
      <div class="summary-tile summary-tile-neutral">
        <span class="summary-icon"><app-icon name="package" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ customCount }}</strong><small>Custom keys</small></div>
      </div>
    </div>

    <div class="card">
      <div class="card-toolbar perm-toolbar">
        <div class="search-box perm-search">
          <app-icon name="search" [size]="15" class="search-leading" />
          <input class="form-control" placeholder="Search by key, label, or category…" [(ngModel)]="search" />
          @if (search) {
            <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear"><app-icon name="x" [size]="14" /></button>
          }
        </div>
      </div>

      @if (loading) {
        <div class="perm-skel-grid">
          @for (i of [1,2,3,4,5,6]; track i) { <div class="perm-group-skel"></div> }
        </div>
      } @else {
        <div class="perm-groups">
          @for (g of visibleGroups(); track g.name) {
            <div class="perm-group">
              <div class="perm-group-head">
                <span class="perm-group-icon"><app-icon [name]="categoryIcon(g.name)" [size]="16" /></span>
                <span class="perm-group-name">{{ pretty(g.name) }}</span>
                <span class="perm-group-count">{{ g.keys.length }}</span>
              </div>
              <div class="perm-keys">
                @for (p of g.keys; track p.key) {
                  <div class="perm-key">
                    <div class="perm-key-head">
                      <code class="perm-key-code">{{ p.key }}</code>
                      @if (canDelete) {
                        <button type="button" class="perm-key-delete" (click)="askDelete(p)" [disabled]="!isCustom(p)" [title]="isCustom(p) ? 'Delete' : 'Built-in permissions cannot be deleted'">
                          <app-icon name="trash" [size]="13" />
                        </button>
                      }
                    </div>
                    @if (p.label && p.label !== p.key) {
                      <span class="perm-key-label">{{ p.label }}</span>
                    }
                  </div>
                }
              </div>
            </div>
          } @empty {
            <div class="perm-empty">
              <div class="perm-empty-icon"><app-icon name="search" [size]="28" /></div>
              <strong>No matches</strong>
              <span>No permissions match “{{ search }}”. Try a different search term.</span>
            </div>
          }
        </div>
      }
    </div>

    @if (showForm) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">Add permission</div>
            <button type="button" class="modal-close" (click)="showForm = false" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Permission key *</label>
              <input class="form-control" [(ngModel)]="form.key" placeholder="module:action" />
              <div class="form-hint">Format: lowercase module + action separated by a colon. Example: <code>students:read</code>.</div>
              @if (form.key && !validKey) { <div class="field-error">Key must match <code>^[a-z][a-z0-9_-]*(:[a-z][a-z0-9_-]*)+$</code>.</div> }
            </div>
            <div class="form-group">
              <label>Label</label>
              <input class="form-control" [(ngModel)]="form.label" placeholder="Students read" />
              <div class="form-hint">Human-readable name shown in role-permissions matrix.</div>
            </div>
            <div class="form-group">
              <label>Category</label>
              <input class="form-control" [(ngModel)]="form.category" placeholder="students" />
              <div class="form-hint">Auto-derived from key if left blank (the part before the colon).</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="showForm = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="!validKey" (click)="create()">
              <app-icon name="check" [size]="14" /> Create permission
            </button>
          </div>
        </div>
      </div>
    }

    @if (confirmTarget) {
      <app-confirm-dialog
        title="Delete permission"
        [message]="'Delete permission ' + confirmTarget.key + '?'"
        (confirm)="confirmDelete()"
        (close)="confirmTarget = null" />
    }
  `,
  styles: [`
    /* Summary tiles */
    .perm-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-tile { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .summary-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; }
    .summary-copy { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
    .summary-copy strong { font-size: 19px; font-weight: 700; }
    .summary-copy small { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .summary-tile-primary .summary-icon { background: var(--primary-light); color: var(--primary); }
    .summary-tile-info .summary-icon { background: rgba(31,111,235,.12); color: #1f6feb; }
    .summary-tile-success .summary-icon { background: rgba(22,163,74,.12); color: var(--success); }
    .summary-tile-neutral .summary-icon { background: var(--neutral-100); color: var(--text-muted); }
    body.dark-theme .summary-tile-info .summary-icon { background: rgba(31,111,235,.22); color: #93c5fd; }
    body.dark-theme .summary-tile-success .summary-icon { background: rgba(22,163,74,.22); color: #6ee7a0; }

    /* Toolbar */
    .perm-toolbar { gap: 10px; }
    .perm-search { flex: 1; position: relative; }
    .search-leading { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .perm-search .form-control { padding-left: 32px; }

    /* Groups */
    .perm-groups { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
    .perm-group { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
    .perm-group-head { display: flex; align-items: center; gap: 10px; padding: 11px 14px; background: var(--neutral-50); border-bottom: 1px solid var(--border); }
    body.dark-theme .perm-group-head { background: rgba(255,255,255,.02); }
    .perm-group-icon { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: var(--primary-light); color: var(--primary); flex-shrink: 0; }
    .perm-group-name { font-size: 13px; font-weight: 700; color: var(--text); flex: 1; min-width: 0; }
    .perm-group-count { font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 2px 8px; background: var(--neutral-100); border-radius: 999px; flex-shrink: 0; }

    /* Permission keys */
    .perm-keys { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; padding: 14px; }
    .perm-key { padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); transition: border-color .15s; }
    .perm-key:hover { border-color: var(--primary); }
    .perm-key-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .perm-key-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text); font-weight: 600; word-break: break-all; }
    .perm-key-delete { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 0; background: transparent; color: var(--text-muted); border-radius: 4px; cursor: pointer; flex-shrink: 0; transition: all .15s; }
    .perm-key-delete:hover:not(:disabled) { background: rgba(192,57,43,.12); color: var(--danger); }
    .perm-key-delete:disabled { cursor: not-allowed; opacity: .35; }
    .perm-key-label { display: block; margin-top: 4px; font-size: 11px; color: var(--text-muted); }

    /* Empty */
    .perm-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 60px 24px; text-align: center; }
    .perm-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .perm-empty strong { font-size: 14px; color: var(--text); }
    .perm-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; line-height: 1.4; }

    /* Skeleton */
    .perm-skel-grid { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .perm-group-skel { height: 80px; border-radius: 12px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: perm-shimmer 1.4s ease infinite; }
    @keyframes perm-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    @media (max-width: 900px) { .perm-summary { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .perm-summary { grid-template-columns: 1fr 1fr; } .perm-keys { grid-template-columns: 1fr; } }
  `],
})
export class PermissionsComponent implements OnInit {
  permissions: PermissionRow[] = [];
  search = '';
  loading = true;
  showForm = false;
  confirmTarget: PermissionRow | null = null;
  form = { key: '', label: '', category: '' };

  /** Built-in permission keys seeded at install time — these cannot be deleted by the
   *  UI even if the user has permissions:delete, to avoid breaking default roles. */
  private builtInKeys = new Set<string>();
  private readonly BUILTIN_HINTS = ['dashboard:read', 'students:read', 'students:create', 'students:update', 'students:delete', 'users:read', 'users:create', 'users:update', 'users:delete', 'roles:read', 'roles:create', 'roles:update', 'roles:delete', 'permissions:read', 'permissions:create', 'permissions:delete', 'audit-logs:read', 'settings:manage', 'reports:read', 'reports:export'];

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {}

  get canCreate(): boolean { return this.perms.hasPermission('permissions:create'); }
  get canDelete(): boolean { return this.perms.hasPermission('permissions:delete'); }

  get total(): number { return this.permissions.length; }
  get customCount(): number { return this.permissions.filter(p => !this.builtInKeys.has(p.key)).length; }
  get validKey(): boolean { return /^[a-z][a-z0-9_-]*(:[a-z][a-z0-9_-]*)+$/.test(this.form.key); }

  ngOnInit(): void {
    // Seed the built-in set from our static hint list. The real source of truth is
    // the server's seeders list, but this hint catches the most common keys so the
    // delete button is correctly disabled on built-ins.
    this.BUILTIN_HINTS.forEach(k => this.builtInKeys.add(k));
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.get<PermissionRow[]>('/permissions', { limit: 500 }).subscribe({
      next: (res) => {
        this.permissions = (res?.data ?? []).slice().sort((a, b) =>
          (a.category ?? '').localeCompare(b.category ?? '') || a.key.localeCompare(b.key)
        );
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  clearSearch(): void { this.search = ''; }

  isCustom(p: PermissionRow): boolean { return !this.builtInKeys.has(p.key); }

  groups(): Group[] {
    const by = new Map<string, PermissionRow[]>();
    for (const p of this.permissions) {
      const g = p.category || p.key.split(':')[0] || 'other';
      if (!by.has(g)) by.set(g, []);
      by.get(g)!.push(p);
    }
    return Array.from(by, ([name, keys]) => ({ name, keys })).sort((a, b) => a.name.localeCompare(b.name));
  }

  visibleGroups(): Group[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.groups();
    return this.groups().map(g => ({ name: g.name, keys: g.keys.filter(p =>
      p.key.toLowerCase().includes(q) ||
      (p.label || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    ) })).filter(g => g.keys.length);
  }

  largestGroup(): Group | undefined {
    const gs = this.groups();
    if (!gs.length) return undefined;
    return gs.reduce((max, g) => g.keys.length > max.keys.length ? g : max);
  }
  largestGroupName(): string {
    return this.largestGroup()?.name ?? '—';
  }
  largestGroupCount(): number {
    return this.largestGroup()?.keys.length ?? 0;
  }

  categoryIcon(group: string): string { return CATEGORY_ICON[group] ?? 'shield'; }
  pretty(s: string): string { return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  openCreate(): void { this.form = { key: '', label: '', category: '' }; this.showForm = true; }

  create(): void {
    if (!this.validKey) return;
    const category = (this.form.category || this.form.key.split(':')[0]).trim();
    this.api.post('/permissions', { key: this.form.key, label: this.form.label || this.pretty(this.form.key), category }).subscribe({
      next: () => {
        this.showForm = false;
        this.toasts.success('Permission created');
        this.load();
      },
      error: () => {},
    });
  }

  askDelete(p: PermissionRow): void {
    if (!this.isCustom(p)) return;
    this.confirmTarget = p;
  }

  confirmDelete(): void {
    if (!this.confirmTarget) return;
    const key = this.confirmTarget.key;
    this.api.delete(`/permissions/${encodeURIComponent(key)}`).subscribe({
      next: () => {
        this.confirmTarget = null;
        this.toasts.success('Permission deleted');
        this.load();
      },
      error: () => { this.confirmTarget = null; },
    });
  }
}
