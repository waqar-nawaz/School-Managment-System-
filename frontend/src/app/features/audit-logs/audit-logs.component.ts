import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface AuditRow {
  id?: number;
  userId?: number;
  userName?: string;
  role?: string;
  userRoleLabel?: string;
  action: string;
  entity: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  createdAt?: string;
}

const ACTION_COLOR: Record<string, string> = {
  create: 'action-create',
  add: 'action-create',
  store: 'action-create',
  update: 'action-update',
  edit: 'action-update',
  patch: 'action-update',
  delete: 'action-delete',
  remove: 'action-delete',
  destroy: 'action-delete',
  login: 'action-login',
  logout: 'action-login',
  export: 'action-export',
  download: 'action-export',
  approve: 'action-approve',
  reject: 'action-approve',
  send: 'action-approve',
};

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Audit Logs</h1>
        <p class="page-subtitle">Every action performed in the system — who, what, and when.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" (click)="load()" [disabled]="loading">
          <app-icon name="refresh" [size]="15" /> Refresh
        </button>
      </div>
    </div>

    <div class="audit-summary">
      <div class="summary-tile summary-tile-primary">
        <span class="summary-icon"><app-icon name="activity" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ total }}</strong><small>Total events</small></div>
      </div>
      <div class="summary-tile summary-tile-success">
        <span class="summary-icon"><app-icon name="plus" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ todayCount }}</strong><small>Today</small></div>
      </div>
      <div class="summary-tile summary-tile-danger">
        <span class="summary-icon"><app-icon name="trash" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ deleteCount }}</strong><small>Deletions</small></div>
      </div>
      <div class="summary-tile summary-tile-info">
        <span class="summary-icon"><app-icon name="users" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ uniqueUsers }}</strong><small>Active users</small></div>
      </div>
    </div>

    <div class="card">
      <div class="card-toolbar audit-toolbar">
        <div class="search-box audit-search">
          <app-icon name="search" [size]="15" class="search-leading" />
          <input class="form-control" placeholder="Search by entity, action, or user…" [(ngModel)]="search" (ngModelChange)="debouncedLoad()" />
          @if (search) {
            <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear">
              <app-icon name="x" [size]="14" />
            </button>
          }
        </div>
        <select class="form-control audit-filter" [(ngModel)]="actionFilter" (ngModelChange)="onFilterChange()">
          <option value="">All actions</option>
          @for (a of ACTION_TYPES; track a) { <option [value]="a">{{ a | titlecase }}</option> }
        </select>
        <select class="form-control audit-filter" [(ngModel)]="entityFilter" (ngModelChange)="onFilterChange()">
          <option value="">All modules</option>
          @for (e of entityOptions; track e) { <option [value]="e">{{ pretty(e) }}</option> }
        </select>
      </div>

      @if (loading) {
        <div class="audit-skel-list">
          @for (i of [1,2,3,4,5,6,7,8]; track i) {
            <div class="audit-row audit-row-skel">
              <div class="action-badge-skel"></div>
              <div class="audit-row-body">
                <div class="line-skel line-skel-name"></div>
                <div class="line-skel line-skel-meta"></div>
              </div>
              <div class="line-skel line-skel-time"></div>
            </div>
          }
        </div>
      } @else {
        <div class="audit-list">
          @for (log of logs; track log.id) {
            <div class="audit-row" (click)="toggleExpand(log.id!)">
              <span class="action-badge {{ actionColor(log.action) }}" [title]="log.action">
                <app-icon [name]="actionIcon(log.action)" [size]="14" />
                <span>{{ log.action }}</span>
              </span>
              <div class="audit-row-main">
                <div class="audit-row-head">
                  <strong class="audit-entity">{{ pretty(log.entity) }}</strong>
                  @if (log.entityId) { <span class="audit-entity-id">#{{ log.entityId }}</span> }
                  <span class="audit-user">
                    <app-icon name="user" [size]="12" />
                    {{ log.userName || ('#' + (log.userId || '—')) }}
                  </span>
                  @if (log.userRoleLabel || log.role) {
                    <span class="audit-role-badge">{{ pretty(log.userRoleLabel || log.role || '') }}</span>
                  }
                </div>
                <div class="audit-row-meta">
                  <span class="meta-item"><app-icon name="clock" [size]="12" /> {{ log.createdAt | date: 'MMM d, y, h:mm a' }}</span>
                  @if (log.ip) { <span class="meta-item meta-mono"><app-icon name="monitor" [size]="12" /> {{ log.ip }}</span> }
                </div>
              </div>
              <span class="audit-expand" [class.expanded]="expandedId === log.id">
                <app-icon name="chevron-right" [size]="14" />
              </span>
            </div>

            @if (expandedId === log.id) {
              <div class="audit-detail">
                <div class="audit-detail-cols">
                  @if (log.oldData && hasKeys(log.oldData)) {
                    <div class="audit-detail-col">
                      <div class="audit-detail-head"><app-icon name="x" [size]="13" /> Before</div>
                      <pre class="audit-json">{{ formatJson(log.oldData) }}</pre>
                    </div>
                  }
                  @if (log.newData && hasKeys(log.newData)) {
                    <div class="audit-detail-col">
                      <div class="audit-detail-head audit-detail-head-after"><app-icon name="check" [size]="13" /> After</div>
                      <pre class="audit-json">{{ formatJson(log.newData) }}</pre>
                    </div>
                  }
                  @if ((!log.oldData || !hasKeys(log.oldData)) && (!log.newData || !hasKeys(log.newData))) {
                    <div class="audit-detail-empty">No payload captured for this event.</div>
                  }
                </div>
                @if (log.userAgent) {
                  <div class="audit-useragent"><app-icon name="monitor" [size]="12" /> {{ log.userAgent }}</div>
                }
              </div>
            }
          } @empty {
            <div class="audit-empty">
              <div class="audit-empty-icon"><app-icon name="search" [size]="28" /></div>
              <strong>{{ hasFilters ? 'No matching events' : 'No audit events yet' }}</strong>
              <span>{{ hasFilters ? 'Try adjusting the filters above.' : 'Actions performed in the system will appear here.' }}</span>
            </div>
          }
        </div>
      }

      <div class="pagination-bar">
        <span class="pagination-count">Page {{ page }} of {{ totalPages || 1 }} · {{ total }} events</span>
        <div class="page-actions">
          <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="prevPage()"><app-icon name="chevron-left" [size]="14" /> Prev</button>
          <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="nextPage()">Next <app-icon name="chevron-right" [size]="14" /></button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Summary tiles */
    .audit-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-tile { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .summary-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; }
    .summary-copy { display: flex; flex-direction: column; line-height: 1.2; }
    .summary-copy strong { font-size: 19px; font-weight: 700; }
    .summary-copy small { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .summary-tile-primary .summary-icon { background: var(--primary-light); color: var(--primary); }
    .summary-tile-success .summary-icon { background: rgba(22,163,74,.12); color: var(--success); }
    .summary-tile-danger .summary-icon { background: rgba(192,57,43,.12); color: var(--danger); }
    .summary-tile-info .summary-icon { background: rgba(31,111,235,.12); color: #1f6feb; }
    body.dark-theme .summary-tile-success .summary-icon { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .summary-tile-danger .summary-icon { background: rgba(192,57,43,.22); color: #fca5a5; }
    body.dark-theme .summary-tile-info .summary-icon { background: rgba(31,111,235,.22); color: #93c5fd; }

    /* Toolbar */
    .audit-toolbar { gap: 10px; }
    .audit-search { flex: 1; position: relative; }
    .search-leading { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .audit-search .form-control { padding-left: 32px; }
    .audit-filter { max-width: 170px; }

    /* Audit list */
    .audit-list { display: flex; flex-direction: column; }
    .audit-row { display: grid; grid-template-columns: 110px 1fr 28px; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--border); transition: background .15s; cursor: pointer; }
    .audit-row:last-child { border-bottom: 0; }
    .audit-row:hover { background: var(--row-hover); }

    .action-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; flex-shrink: 0; }
    .action-create { background: rgba(22,163,74,.12); color: var(--success); }
    .action-update { background: rgba(217,119,6,.14); color: var(--warning); }
    .action-delete { background: rgba(192,57,43,.12); color: var(--danger); }
    .action-login { background: rgba(20,83,116,.12); color: var(--primary); }
    .action-export { background: rgba(14,116,144,.12); color: #0e7490; }
    .action-approve { background: rgba(108,52,131,.14); color: #6c3483; }
    body.dark-theme .action-create { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .action-update { background: rgba(217,119,6,.22); color: #fcd34d; }
    body.dark-theme .action-delete { background: rgba(192,57,43,.22); color: #fca5a5; }
    body.dark-theme .action-login { background: rgba(95,180,229,.22); color: #93c5fd; }

    .audit-row-main { min-width: 0; }
    .audit-row-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
    .audit-entity { color: var(--text); font-weight: 600; }
    .audit-entity-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text-muted); }
    .audit-user { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted); padding: 2px 8px; background: var(--neutral-100); border-radius: 999px; }
    body.dark-theme .audit-user { background: rgba(255,255,255,.06); }
    .audit-role-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; padding: 2px 6px; border-radius: 4px; background: var(--primary-light); color: var(--primary); }

    .audit-row-meta { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 5px; font-size: 11px; color: var(--text-muted); }
    .meta-item { display: inline-flex; align-items: center; gap: 5px; }
    .meta-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

    .audit-expand { display: inline-flex; align-items: center; justify-content: center; color: var(--text-muted); transition: transform .15s; }
    .audit-expand.expanded { transform: rotate(90deg); }

    /* Detail panel */
    .audit-detail { padding: 14px 16px; background: var(--neutral-50); border-bottom: 1px solid var(--border); animation: audit-fade-in .15s ease; }
    body.dark-theme .audit-detail { background: rgba(255,255,255,.02); }
    @keyframes audit-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .audit-detail-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .audit-detail-col { display: flex; flex-direction: column; gap: 6px; }
    .audit-detail-head { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--danger); }
    .audit-detail-head-after { color: var(--success); }
    .audit-json { margin: 0; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.5; color: var(--text); white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow: auto; }
    .audit-detail-empty { grid-column: 1 / -1; text-align: center; padding: 14px; color: var(--text-muted); font-size: 12px; font-style: italic; }
    .audit-useragent { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }

    /* Empty */
    .audit-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 60px 24px; text-align: center; }
    .audit-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .audit-empty strong { font-size: 14px; color: var(--text); }
    .audit-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; line-height: 1.4; }

    /* Skeleton */
    .audit-skel-list { display: flex; flex-direction: column; }
    .audit-row-skel { cursor: default; border-bottom: 1px solid var(--border); padding: 12px 16px; }
    .action-badge-skel { width: 80px; height: 24px; border-radius: 6px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: audit-shimmer 1.4s ease infinite; }
    .audit-row-body { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .line-skel { height: 10px; border-radius: 4px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: audit-shimmer 1.4s ease infinite; }
    .line-skel-name { width: 220px; }
    .line-skel-meta { width: 280px; height: 9px; }
    .line-skel-time { width: 100px; }
    @keyframes audit-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    /* Pagination */
    .pagination-count { color: var(--text-muted); font-size: 12px; }

    @media (max-width: 900px) { .audit-summary { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 760px) {
      .audit-toolbar { flex-wrap: wrap; }
      .audit-filter { max-width: none; flex: 1 1 calc(50% - 5px); }
      .audit-row { grid-template-columns: 90px 1fr; }
      .audit-expand { display: none; }
      .audit-detail-cols { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .audit-summary { grid-template-columns: 1fr 1fr; }
      .audit-row-meta { gap: 8px; }
      .audit-row-meta .meta-mono { display: none; }
    }
  `],
})
export class AuditLogsComponent implements OnInit {
  readonly ACTION_TYPES = ['create', 'update', 'delete', 'login', 'logout', 'export', 'approve', 'reject', 'send'];

  logs: AuditRow[] = [];
  total = 0;
  todayCount = 0;
  deleteCount = 0;
  uniqueUsers = 0;
  page = 1;
  pageSize = 20;
  search = '';
  actionFilter = '';
  entityFilter = '';
  loading = true;
  expandedId: number | null = null;
  entityOptions: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void { this.load(); }

  get totalPages(): number { return Math.ceil(this.total / this.pageSize); }
  get hasFilters(): boolean { return !!(this.search || this.actionFilter || this.entityFilter); }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.pageSize, q: this.search };
    if (this.actionFilter) params['filter[action]'] = this.actionFilter;
    if (this.entityFilter) params['filter[entity]'] = this.entityFilter;
    this.api.get<AuditRow[]>('/audit-logs', params).subscribe({
      next: (res) => {
        this.logs = res?.data ?? [];
        this.total = res?.meta?.total ?? this.logs.length;
        // Page-level derived stats — best-effort while preserving server total.
        const today = new Date().toLocaleDateString('en-CA');
        this.todayCount = this.logs.filter(l => (l.createdAt || '').slice(0, 10) === today).length;
        this.deleteCount = this.logs.filter(l => String(l.action).toLowerCase() === 'delete').length;
        this.uniqueUsers = new Set(this.logs.map(l => l.userId).filter(Boolean)).size;
        // Build entity filter options from what we've seen.
        const entities = new Set<string>();
        for (const l of this.logs) if (l.entity) entities.add(l.entity);
        this.entityOptions = Array.from(entities).sort();
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  clearSearch(): void { this.search = ''; this.page = 1; this.load(); }
  debouncedLoad(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => { this.page = 1; this.load(); }, 300);
  }
  onFilterChange(): void { this.page = 1; this.load(); }
  prevPage(): void { if (this.page > 1) { this.page--; this.load(); } }
  nextPage(): void { if (this.page < this.totalPages) { this.page++; this.load(); } }

  toggleExpand(id: number): void { this.expandedId = this.expandedId === id ? null : id; }

  hasKeys(obj: Record<string, unknown> | undefined): boolean {
    return !!obj && Object.keys(obj).length > 0;
  }

  formatJson(obj: unknown): string {
    try { return JSON.stringify(obj, null, 2); }
    catch { return String(obj); }
  }

  /** Pick a CSS class for the action badge so each intent is visually distinct. */
  actionColor(action: string): string {
    return ACTION_COLOR[String(action || '').toLowerCase()] ?? 'action-login';
  }

  /** Pick an icon name for the action badge. */
  actionIcon(action: string): string {
    const a = String(action || '').toLowerCase();
    if (['create', 'add', 'store'].includes(a)) return 'plus';
    if (['update', 'edit', 'patch'].includes(a)) return 'edit';
    if (['delete', 'remove', 'destroy'].includes(a)) return 'trash';
    if (['login', 'log-in'].includes(a)) return 'log-in';
    if (['logout', 'log-out'].includes(a)) return 'log-out';
    if (['export', 'download'].includes(a)) return 'download';
    if (['approve', 'send'].includes(a)) return 'check';
    if (['reject'].includes(a)) return 'x';
    return 'activity';
  }

  pretty(s: string): string { return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
}
