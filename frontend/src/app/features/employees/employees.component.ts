import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { formatMoney } from '../../core/utils/currency';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CredentialsDialogComponent, LoginCredential } from '../../shared/components/credentials-dialog/credentials-dialog.component';

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'teacher', label: 'Teacher' }, { value: 'staff', label: 'Staff' }, { value: 'accountant', label: 'Accountant' },
  { value: 'librarian', label: 'Librarian' }, { value: 'hostel_warden', label: 'Hostel warden' },
  { value: 'transport_manager', label: 'Transport manager' }, { value: 'receptionist', label: 'Receptionist' }, { value: 'principal', label: 'Principal' },
];

const blank = () => ({
  firstName: '', lastName: '', role: 'teacher', email: '', phone: '', gender: '', department: '', designation: '',
  hireDate: new Date().toLocaleDateString('en-CA'), basicSalary: null as number | null, staffNo: '',
});

/** All employees in one place: hire (login + profile + salary in one step), edit, deactivate. */
@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, ConfirmDialogComponent, CredentialsDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Employees</h1>
        <p class="page-subtitle">Teachers and all other staff. Each employee has one login and one profile; salary set here feeds the monthly payroll.</p>
      </div>
      <div class="page-actions">
        @if (canCreate) { <button class="btn btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="15" /> Add employee</button> }
      </div>
    </div>

    <div class="emp-summary">
      <div class="summary-tile summary-tile-primary">
        <span class="summary-icon"><app-icon name="briefcase" [size]="18" /></span>
        <div class="summary-copy"><strong>{{ summary?.total ?? '—' }}</strong><small>Active employees</small></div>
      </div>
      @for (t of typeCounts(); track t.label) {
        <div class="summary-tile summary-tile-{{ typeColor(t.value) }}">
          <span class="summary-icon"><app-icon [name]="typeIcon(t.value)" [size]="18" /></span>
          <div class="summary-copy"><strong>{{ t.count }}</strong><small>{{ t.label }}</small></div>
        </div>
      }
      @if (summary && summary.withoutSalary > 0) {
        <div class="summary-tile summary-tile-warn">
          <span class="summary-icon"><app-icon name="alert" [size]="18" /></span>
          <div class="summary-copy"><strong>{{ summary.withoutSalary }}</strong><small>No salary set</small></div>
        </div>
      }
    </div>

    <div class="card">
      <div class="card-toolbar emp-toolbar">
        <div class="search-box emp-search">
          <app-icon name="search" [size]="15" class="search-leading" />
          <input class="form-control" placeholder="Search name, number, department…" [(ngModel)]="search" (ngModelChange)="searchInput$.next()" />
          @if (search) { <button type="button" class="search-clear" (click)="search = ''; reload()" aria-label="Clear search"><app-icon name="x" [size]="14" /></button> }
        </div>
        <select class="form-control emp-filter" [(ngModel)]="typeFilter" (ngModelChange)="reload()">
          <option value="">All types</option>
          @for (r of roles; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
        </select>
        <select class="form-control emp-filter-sm" [(ngModel)]="statusFilter" (ngModelChange)="reload()">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </select>
      </div>

      @if (loading) {
        <div class="emp-skel-list">
          @for (i of [1,2,3,4,5,6,7,8]; track i) {
            <div class="emp-row-skel">
              <div class="avatar-skel-sm"></div>
              <div class="emp-row-body">
                <div class="line-skel line-skel-name"></div>
                <div class="line-skel line-skel-meta"></div>
              </div>
              <div class="line-skel line-skel-salary"></div>
            </div>
          }
        </div>
      } @else {
        <div class="emp-list">
          @for (e of rows; track e.id) {
            <div class="emp-row" [class.emp-row-inactive]="!e.isActive">
              <div class="emp-avatar emp-avatar-{{ typeColor(e.employeeType) }}">
                {{ initials(e.firstName, e.lastName) }}
              </div>
              <div class="emp-row-main">
                <div class="emp-row-head">
                  <strong class="emp-name">{{ e.fullName }}</strong>
                  <span class="emp-staff-no">{{ e.staffNo }}</span>
                  <span class="emp-type-badge emp-type-{{ typeColor(e.employeeType) }}">{{ e.employeeTypeLabel }}</span>
                  @if (e.isActive) {
                    <span class="emp-status-pill emp-status-active">Active</span>
                  } @else {
                    <span class="emp-status-pill emp-status-inactive">Inactive</span>
                  }
                </div>
                <div class="emp-row-meta">
                  @if (e.department) { <span class="meta-item"><app-icon name="layers" [size]="12" /> {{ e.department }}</span> }
                  @if (e.designation) { <span class="meta-item"><app-icon name="briefcase" [size]="12" /> {{ e.designation }}</span> }
                  @if (e.username) { <span class="meta-item meta-mono"><app-icon name="user" [size]="12" /> {{ e.username }}</span> }
                  @if (e.phone) { <span class="meta-item meta-mono"><app-icon name="phone" [size]="12" /> {{ e.phone }}</span> }
                  @if (e.hireDate) { <span class="meta-item"><app-icon name="calendar" [size]="12" /> {{ e.hireDate | date: 'MMM d, y' }}</span> }
                </div>
              </div>
              <div class="emp-row-side">
                <div class="emp-salary" [class.emp-salary-unset]="+e.basicSalary <= 0">
                  @if (+e.basicSalary > 0) {
                    <strong>{{ money(e.basicSalary) }}</strong>
                    <small>monthly</small>
                  } @else {
                    <span class="emp-salary-warn">Not set</span>
                  }
                </div>
              </div>
              <div class="emp-row-actions">
                @if (canUpdate) {
                  <button class="btn btn-sm btn-ghost" (click)="openEdit(e)"><app-icon name="edit" [size]="14" /> Edit</button>
                }
                @if (e.employeeType === 'teacher') {
                  <a class="btn btn-sm btn-ghost" routerLink="/teachers" title="Qualification, specialization…">Teaching</a>
                }
                @if (canToggle && e.userId) {
                  @if (e.isActive) {
                    <button class="btn btn-sm btn-ghost" (click)="confirmToggle = e" aria-label="Deactivate"><app-icon name="lock" [size]="14" /></button>
                  } @else {
                    <button class="btn btn-sm btn-primary" (click)="toggle(e, true)">Reactivate</button>
                  }
                }
              </div>
            </div>
          } @empty {
            <div class="emp-empty">
              <div class="emp-empty-icon"><app-icon name="briefcase" [size]="28" /></div>
              <strong>{{ hasFilters ? 'No matches' : 'No employees yet' }}</strong>
              <span>{{ hasFilters ? 'Try adjusting the search or type filter.' : 'Click "Add employee" to hire the first staff member.' }}</span>
            </div>
          }
        </div>
      }
      @if (total > limit) {
        <div class="pagination-bar">
          <span class="pagination-count">Page {{ page }} of {{ totalPages || 1 }} · {{ total }} employees</span>
          <div class="page-actions">
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="setPage(page - 1)"><app-icon name="chevron-left" [size]="14" /></button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="setPage(page + 1)"><app-icon name="chevron-right" [size]="14" /></button>
          </div>
        </div>
      }
    </div>

    @if (showForm) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">{{ editing ? 'Edit ' + editing.fullName : 'Add an employee' }}</div>
            <button type="button" class="modal-close" (click)="showForm = false" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          @if (!editing) {
            <p class="page-subtitle" style="margin:0 0 1rem">This creates the employee's login <em>and</em> profile. The login details are shown once after saving.</p>
          }
          <form (ngSubmit)="save()" #f="ngForm" novalidate>
            <div class="form-grid">
              <div class="form-group">
                <label>First name *</label>
                <input class="form-control" name="firstName" [(ngModel)]="form.firstName" required #fn="ngModel" />
                @if ((f.submitted || fn.touched) && fn.invalid) { <div class="field-error">First name is required</div> }
              </div>
              <div class="form-group"><label>Last name</label><input class="form-control" name="lastName" [(ngModel)]="form.lastName" /></div>
              @if (!editing) {
                <div class="form-group">
                  <label>Type of employee *</label>
                  <select class="form-control" name="role" [(ngModel)]="form.role">
                    @for (r of roles; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
                  </select>
                  <div class="form-hint">Decides what they can open in the system.</div>
                </div>
              } @else {
                <div class="form-group"><label>Type</label><input class="form-control" [value]="editing.employeeTypeLabel" disabled /><div class="form-hint">Change it from Users (the role).</div></div>
              }
              <div class="form-group">
                <label>Email * <small style="opacity:.7">(login address)</small></label>
                <input type="email" class="form-control" name="email" [(ngModel)]="form.email" required #em="ngModel" />
                @if ((f.submitted || em.touched) && em.invalid) { <div class="field-error">A valid email is required</div> }
              </div>
              <div class="form-group"><label>Phone</label><input type="tel" class="form-control" name="phone" [(ngModel)]="form.phone" placeholder="0300 1234567" /></div>
              @if (!editing) {
                <div class="form-group"><label>Gender</label>
                  <select class="form-control" name="gender" [(ngModel)]="form.gender"><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select>
                </div>
              }
              <div class="form-group"><label>Department</label><input class="form-control" name="department" [(ngModel)]="form.department" placeholder="e.g. Science, Accounts" /></div>
              <div class="form-group"><label>Designation</label><input class="form-control" name="designation" [(ngModel)]="form.designation" placeholder="e.g. Senior Teacher" /></div>
              <div class="form-group"><label>Hire date</label><input type="date" class="form-control" name="hireDate" [(ngModel)]="form.hireDate" /></div>
              <div class="form-group">
                <label>Monthly basic salary</label>
                <input type="number" min="0" class="form-control" name="basicSalary" [(ngModel)]="form.basicSalary" placeholder="0" />
                <div class="form-hint">Used when you prepare the monthly payroll. You can adjust each month.</div>
              </div>
              @if (editing) {
                <div class="form-group"><label>Employee number</label><input class="form-control" name="staffNo" [(ngModel)]="form.staffNo" /></div>
              }
            </div>
            @if (formError) { <div class="field-error" style="margin-top:.75rem">{{ formError }}</div> }
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showForm = false">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving"><app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : (editing ? 'Save changes' : 'Add employee') }}</button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (confirmToggle) {
      <app-confirm-dialog
        title="Deactivate this employee?"
        [message]="confirmToggle.fullName + ' will not be able to log in and will be left out of future payroll. Past records are kept and you can reactivate later.'"
        confirmLabel="Deactivate" [danger]="true"
        (confirm)="toggle(confirmToggle, false)" (close)="confirmToggle = null" />
    }
    @if (issued) { <app-credentials-dialog [title]="issued.title" [credentials]="issued.credentials" (close)="issued = null" /> }
  `,
  styles: [`
    /* Summary tiles */
    .emp-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .summary-tile { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .summary-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; }
    .summary-copy { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
    .summary-copy strong { font-size: 19px; font-weight: 700; }
    .summary-copy small { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .summary-tile-primary .summary-icon { background: var(--primary-light); color: var(--primary); }
    .summary-tile-warn .summary-icon { background: rgba(217,119,6,.14); color: var(--warning); }
    .summary-tile-teacher .summary-icon { background: rgba(31,111,235,.12); color: #1f6feb; }
    .summary-tile-staff .summary-icon { background: var(--neutral-100); color: var(--text-muted); }
    .summary-tile-accountant .summary-icon { background: rgba(14,116,144,.12); color: #0e7490; }
    .summary-tile-librarian .summary-icon { background: rgba(176,58,46,.12); color: #b03a2e; }
    .summary-tile-hostel_warden .summary-icon { background: rgba(40,116,166,.12); color: #2874a6; }
    .summary-tile-transport_manager .summary-icon { background: rgba(136,78,160,.12); color: #884ea0; }
    .summary-tile-receptionist .summary-icon { background: rgba(22,160,133,.12); color: #16a085; }
    .summary-tile-principal .summary-icon { background: var(--primary-light); color: var(--primary); }
    body.dark-theme .summary-tile-teacher .summary-icon { background: rgba(31,111,235,.22); color: #93c5fd; }
    body.dark-theme .summary-tile-warn .summary-icon { background: rgba(217,119,6,.22); color: #fcd34d; }

    /* Toolbar */
    .emp-toolbar { gap: 10px; }
    .emp-search { flex: 1; position: relative; }
    .emp-search .search-leading { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .emp-search .form-control { padding-left: 32px; }
    .emp-filter { max-width: 190px; }
    .emp-filter-sm { max-width: 130px; }

    /* Employee list */
    .emp-list { display: flex; flex-direction: column; }
    .emp-row { display: grid; grid-template-columns: 44px 1fr 130px auto; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--border); transition: background .15s; }
    .emp-row:last-child { border-bottom: 0; }
    .emp-row:hover { background: var(--row-hover); }
    .emp-row-inactive { opacity: .65; }

    .emp-avatar { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: #fff; text-transform: uppercase; flex-shrink: 0; }
    .emp-avatar-teacher { background: #1f6feb; }
    .emp-avatar-staff { background: #5d6d7e; }
    .emp-avatar-accountant { background: #0e7490; }
    .emp-avatar-librarian { background: #b03a2e; }
    .emp-avatar-hostel_warden { background: #2874a6; }
    .emp-avatar-transport_manager { background: #884ea0; }
    .emp-avatar-receptionist { background: #16a085; }
    .emp-avatar-principal { background: #145374; }
    .emp-avatar-default { background: var(--neutral-500); }

    .emp-row-main { min-width: 0; }
    .emp-row-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .emp-name { font-size: 14px; font-weight: 600; color: var(--text); }
    .emp-staff-no { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text-muted); }
    .emp-type-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; background: var(--neutral-100); color: var(--text-muted); }
    .emp-type-teacher { background: rgba(31,111,235,.12); color: #1f6feb; }
    .emp-type-accountant { background: rgba(14,116,144,.12); color: #0e7490; }
    .emp-type-librarian { background: rgba(176,58,46,.12); color: #b03a2e; }
    .emp-type-hostel_warden { background: rgba(40,116,166,.12); color: #2874a6; }
    .emp-type-transport_manager { background: rgba(136,78,160,.12); color: #884ea0; }
    .emp-type-receptionist { background: rgba(22,160,133,.12); color: #16a085; }
    .emp-type-principal { background: var(--primary-light); color: var(--primary); }
    body.dark-theme .emp-type-teacher { background: rgba(31,111,235,.22); color: #93c5fd; }

    .emp-status-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .emp-status-active { background: rgba(22,163,74,.12); color: var(--success); }
    .emp-status-inactive { background: rgba(192,57,43,.12); color: var(--danger); }
    body.dark-theme .emp-status-active { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .emp-status-inactive { background: rgba(192,57,43,.22); color: #fca5a5; }

    .emp-row-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 5px; font-size: 11px; color: var(--text-muted); }
    .meta-item { display: inline-flex; align-items: center; gap: 4px; }
    .meta-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

    .emp-row-side { display: flex; flex-direction: column; align-items: flex-end; }
    .emp-salary { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
    .emp-salary strong { font-size: 15px; font-weight: 700; color: var(--text); }
    .emp-salary small { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
    .emp-salary-warn { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px; background: rgba(217,119,6,.14); color: var(--warning); font-size: 11px; font-weight: 600; }
    body.dark-theme .emp-salary-warn { background: rgba(217,119,6,.22); color: #fcd34d; }

    .emp-row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

    /* Skeleton */
    .emp-skel-list { display: flex; flex-direction: column; }
    .emp-row-skel { display: grid; grid-template-columns: 44px 1fr 130px; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .avatar-skel-sm { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: emp-shimmer 1.4s ease infinite; }
    .emp-row-body { display: flex; flex-direction: column; gap: 6px; }
    .line-skel { height: 10px; border-radius: 4px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: emp-shimmer 1.4s ease infinite; }
    .line-skel-name { width: 200px; }
    .line-skel-meta { width: 280px; height: 9px; }
    .line-skel-salary { width: 90px; }
    @keyframes emp-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    /* Empty */
    .emp-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 60px 24px; text-align: center; }
    .emp-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .emp-empty strong { font-size: 14px; color: var(--text); }
    .emp-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; line-height: 1.4; }

    .pagination-count { color: var(--text-muted); font-size: 12px; }

    @media (max-width: 900px) {
      .emp-row { grid-template-columns: 44px 1fr auto; }
      .emp-row-side { display: none; }
    }
    @media (max-width: 760px) {
      .emp-row { grid-template-columns: 40px 1fr; }
      .emp-row-actions { grid-column: 1 / -1; justify-content: flex-start; margin-top: 6px; }
      .emp-row-meta .meta-mono { display: none; }
    }
  `],
})
export class EmployeesComponent implements OnInit, OnDestroy {
  readonly roles = ROLES;
  rows: any[] = [];
  total = 0;
  page = 1;
  readonly limit = 15;
  loading = false;
  search = '';
  typeFilter = '';
  statusFilter = 'true';
  summary: { total: number; byType: Record<string, number>; withoutSalary: number } | null = null;

  showForm = false;
  editing: any = null;
  form = blank();
  saving = false;
  formError = '';
  confirmToggle: any = null;
  issued: { title: string; credentials: LoginCredential[] } | null = null;
  readonly searchInput$ = new Subject<void>();
  private sub?: { unsubscribe(): void };

  constructor(private readonly api: ApiService, private readonly toasts: ToastService, private readonly perms: PermissionService) {}

  get canCreate(): boolean { return this.perms.hasPermission('staff:create') && this.perms.hasPermission('users:create'); }
  get canUpdate(): boolean { return this.perms.hasPermission('staff:update'); }
  get canToggle(): boolean { return this.perms.hasPermission('users:update'); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  get hasFilters(): boolean { return !!(this.search || this.typeFilter || (this.statusFilter && this.statusFilter !== 'true')); }
  money(v: unknown): string { return formatMoney(v); }

  /** Two-letter initials for the avatar circle. */
  initials(first: string, last: string): string {
    const f = (first || '').trim().charAt(0);
    const l = (last || '').trim().charAt(0);
    if (f && l) return (f + l).toUpperCase();
    if (f) return f.toUpperCase();
    return '?';
  }

  /** Map an employee type to a CSS color token shared by avatars, type badges,
   *  and summary tiles so the visual identity is consistent across the screen. */
  typeColor(role: string): string {
    const known = ['teacher', 'staff', 'accountant', 'librarian', 'hostel_warden', 'transport_manager', 'receptionist', 'principal'];
    return known.includes(role) ? role : 'default';
  }

  /** Pick a representative icon for each employee type. */
  typeIcon(role: string): string {
    switch (role) {
      case 'teacher': return 'user-check';
      case 'accountant': return 'dollar';
      case 'librarian': return 'book';
      case 'hostel_warden': return 'bed';
      case 'transport_manager': return 'truck';
      case 'receptionist': return 'mail';
      case 'principal': return 'shield';
      default: return 'briefcase';
    }
  }

  ngOnInit(): void {
    this.sub = this.searchInput$.pipe(debounceTime(300)).subscribe(() => this.reload());
    this.load();
    this.loadSummary();
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  typeCounts(): Array<{ label: string; count: number; value: string }> {
    if (!this.summary) return [];
    return Object.entries(this.summary.byType)
      .map(([k, count]) => ({ value: k, label: this.roles.find((r) => r.value === k)?.label ?? k, count }))
      .sort((a, b) => b.count - a.count).slice(0, 4);
  }

  reload(): void { this.page = 1; this.load(); }
  setPage(p: number): void { this.page = p; this.load(); }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.limit };
    if (this.search.trim()) params['q'] = this.search.trim();
    if (this.typeFilter) params['filter[employeeType]'] = this.typeFilter;
    if (this.statusFilter) params['filter[isActive]'] = this.statusFilter;
    this.api.get<any[]>('/staff', params).subscribe({
      next: (r) => { this.rows = r?.data ?? []; this.total = r?.meta?.total ?? this.rows.length; this.loading = false; },
      error: () => (this.loading = false),
    });
  }

  loadSummary(): void {
    this.api.get<any>('/employees/summary').subscribe({ next: (r) => (this.summary = r?.data ?? null), error: () => {} });
  }

  openCreate(): void { this.editing = null; this.form = blank(); this.formError = ''; this.showForm = true; }

  openEdit(e: any): void {
    this.editing = e;
    this.form = {
      firstName: e.firstName ?? '', lastName: e.lastName ?? '', role: e.employeeType, email: e.email ?? '', phone: e.phone ?? '', gender: e.gender ?? '',
      department: e.department ?? '', designation: e.designation ?? '', hireDate: e.hireDate ? String(e.hireDate).slice(0, 10) : '',
      basicSalary: e.basicSalary != null ? Number(e.basicSalary) : null, staffNo: e.staffNo ?? '',
    };
    this.formError = '';
    this.showForm = true;
  }

  save(): void {
    const f = this.form;
    this.formError = '';
    if (!f.firstName.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) { this.formError = 'Please fill the required fields: first name and a valid email.'; return; }
    if (f.basicSalary !== null && Number(f.basicSalary) < 0) { this.formError = 'Salary cannot be negative.'; return; }
    const salary = f.basicSalary === null || (f.basicSalary as unknown) === '' ? 0 : Number(f.basicSalary);
    this.saving = true;
    const fail = (err: any) => { this.saving = false; this.formError = err?.error?.message || 'Could not save. Please try again.'; };

    if (this.editing) {
      this.api.put(`/staff/${this.editing.id}`, {
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), phone: f.phone.trim(),
        department: f.department.trim(), designation: f.designation.trim(), hireDate: f.hireDate || null, basicSalary: salary, staffNo: f.staffNo.trim(),
      }).subscribe({
        next: () => { this.saving = false; this.showForm = false; this.toasts.success('Employee updated'); this.load(); this.loadSummary(); },
        error: fail,
      });
      return;
    }
    this.api.post<any>('/employees', {
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), role: f.role, email: f.email.trim(), phone: f.phone.trim(),
      gender: f.gender || undefined, department: f.department.trim(), designation: f.designation.trim(), hireDate: f.hireDate || undefined, basicSalary: salary,
    }).subscribe({
      next: (r) => {
        this.saving = false; this.showForm = false;
        this.toasts.success(`${f.firstName} added (${r?.data?.employee?.staffNo ?? ''})`);
        this.load(); this.loadSummary();
        const creds: LoginCredential[] = r?.data?.credentials ?? [];
        if (creds.length) this.issued = { title: `Login for ${f.firstName} ${f.lastName}`.trim(), credentials: creds.map((c) => ({ ...c, role: 'staff' })) };
      },
      error: fail,
    });
  }

  toggle(e: any, active: boolean): void {
    this.confirmToggle = null;
    this.api.patch(`/users/${e.userId}/status`, { isActive: active }).subscribe({
      next: () => { this.toasts.success(active ? `${e.firstName} reactivated` : `${e.firstName} deactivated`); this.load(); this.loadSummary(); },
      error: () => {},
    });
  }
}
