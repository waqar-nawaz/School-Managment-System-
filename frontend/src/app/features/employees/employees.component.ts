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

    <div class="summary-row">
      <div class="mini-card"><span class="stat-label">Active employees</span><span class="stat-value">{{ summary?.total ?? '—' }}</span></div>
      @for (t of typeCounts(); track t.label) {
        <div class="mini-card"><span class="stat-label">{{ t.label }}</span><span class="stat-value">{{ t.count }}</span></div>
      }
      @if (summary && summary.withoutSalary > 0) {
        <div class="mini-card warn-card"><span class="stat-label">No salary set</span><span class="stat-value">{{ summary.withoutSalary }}</span></div>
      }
    </div>

    <div class="card">
      <div class="card-toolbar">
        <div class="search-box">
          <input class="form-control" placeholder="Search name, number, department…" [(ngModel)]="search" (ngModelChange)="searchInput$.next()" />
          @if (search) { <button type="button" class="search-clear" (click)="search = ''; reload()" aria-label="Clear search"><app-icon name="x" [size]="14" /></button> }
        </div>
        <select class="form-control" style="max-width:190px" [(ngModel)]="typeFilter" (ngModelChange)="reload()">
          <option value="">All types</option>
          @for (r of roles; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
        </select>
        <select class="form-control" style="max-width:150px" [(ngModel)]="statusFilter" (ngModelChange)="reload()">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </select>
      </div>

      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>No</th><th>Employee</th><th>Type</th><th>Department / role</th><th>Hired</th><th>Basic salary</th><th>Status</th><th style="width:210px;text-align:right">Actions</th></tr></thead>
          <tbody>
            @for (e of rows; track e.id) {
              <tr>
                <td>{{ e.staffNo }}</td>
                <td>{{ e.fullName }}<div class="form-hint" style="margin:0">{{ e.username }}{{ e.phone ? ' · ' + e.phone : '' }}</div></td>
                <td><span class="badge badge-info">{{ e.employeeTypeLabel }}</span></td>
                <td>{{ e.department || '—' }}<div class="form-hint" style="margin:0">{{ e.designation }}</div></td>
                <td>{{ e.hireDate ? (e.hireDate | date: 'MMM d, y') : '—' }}</td>
                <td>@if (+e.basicSalary > 0) { {{ money(e.basicSalary) }} } @else { <span class="badge badge-warning">not set</span> }</td>
                <td><span class="badge badge-{{ e.isActive ? 'success' : 'danger' }}">{{ e.isActive ? 'Active' : 'Inactive' }}</span></td>
                <td style="text-align:right;white-space:nowrap">
                  @if (canUpdate) { <button class="btn btn-sm btn-ghost" (click)="openEdit(e)"><app-icon name="edit" [size]="14" /> Edit</button> }
                  @if (e.employeeType === 'teacher') { <a class="btn btn-sm btn-ghost" routerLink="/teachers" title="Qualification, specialization…">Teaching</a> }
                  @if (canToggle && e.userId) {
                    @if (e.isActive) { <button class="btn btn-sm btn-ghost" (click)="confirmToggle = e" aria-label="Deactivate"><app-icon name="lock" [size]="14" /></button> }
                    @else { <button class="btn btn-sm btn-primary" (click)="toggle(e, true)">Reactivate</button> }
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty-cell">{{ loading ? 'Loading…' : (search || typeFilter ? 'No employees match your filters.' : 'No employees yet. Click “Add employee”.') }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (total > limit) {
        <div class="pagination-bar">
          <span>{{ total }} employee(s) — page {{ page }} of {{ totalPages }}</span>
          <div>
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
    .summary-row { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .warn-card { border: 1px solid rgba(245,158,11,.6); }
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
  money(v: unknown): string { return formatMoney(v); }

  ngOnInit(): void {
    this.sub = this.searchInput$.pipe(debounceTime(300)).subscribe(() => this.reload());
    this.load();
    this.loadSummary();
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  typeCounts(): Array<{ label: string; count: number }> {
    if (!this.summary) return [];
    return Object.entries(this.summary.byType)
      .map(([k, count]) => ({ label: this.roles.find((r) => r.value === k)?.label ?? k, count }))
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
