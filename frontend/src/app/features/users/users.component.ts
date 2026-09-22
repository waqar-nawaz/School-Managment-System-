import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { User } from '../../core/models/user.model';
import { USER_ROLES } from '../../core/constants/roles';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Users</h1>
        <p class="page-subtitle">System accounts and roles</p>
      </div>
      <div class="page-actions">
        @if (canCreate) { <button class="btn btn-primary" (click)="openCreate()">+ Add user</button> }
      </div>
    </div>

    <div class="card">
      <div class="card-toolbar">
        <input class="form-control" style="max-width:300px" placeholder="Search…" [(ngModel)]="search" (ngModelChange)="debouncedLoad()" />
        <select class="form-control" style="max-width:160px" [(ngModel)]="roleFilter" (ngModelChange)="load()">
          <option value="">All roles</option>
          @for (r of ROLES; track r) { <option [value]="r">{{ r }}</option> }
        </select>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Username</th><th>Role</th><th>Phone</th><th>Status</th><th style="width:180px;text-align:right">Actions</th></tr>
          </thead>
          <tbody>
            @for (u of users; track u.id) {
              <tr>
                <td>{{ u.firstName }} {{ u.lastName }}</td>
                <td>{{ u.email }}</td>
                <td>{{ u.username }}</td>
                <td><span class="badge">{{ u.role }}</span></td>
                <td>{{ u.phone || '—' }}</td>
                <td>@if (u.isActive) {<span class="badge badge-success">Active</span>} @else {<span class="badge badge-danger">Disabled</span>}</td>
                <td style="text-align:right;white-space:nowrap">
                  @if (canUpdate) { <button class="btn btn-sm btn-ghost" (click)="openEdit(u)">Edit</button> }
                  @if (canUpdate) { <button class="btn btn-sm btn-ghost" (click)="resetPassword(u)">Reset PW</button> }
                  @if (canUpdate) {
                    <button class="btn btn-sm btn-ghost" (click)="toggleStatus(u)">{{ u.isActive ? 'Disable' : 'Enable' }}</button>
                  }
                  @if (canDelete) { <button class="btn btn-sm btn-ghost-danger" (click)="askDelete(u)">Delete</button> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty-cell">No users found.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <span>Page {{ page }} of {{ totalPages || 1 }} ({{ total }})</span>
        <div class="page-actions">
          <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="prevPage()">Prev</button>
          <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="nextPage()">Next</button>
        </div>
      </div>
    </div>

    @if (showForm) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-title">{{ editing ? 'Edit user' : 'Add user' }}</div>
          <form (ngSubmit)="save()" #f="ngForm">
            <div class="form-grid">
              <div class="form-group"><label>Username *</label><input class="form-control" name="username" [(ngModel)]="form.username" required /></div>
              <div class="form-group"><label>Email *</label><input class="form-control" name="email" [(ngModel)]="form.email" required /></div>
              <div class="form-group"><label>First name</label><input class="form-control" name="firstName" [(ngModel)]="form.firstName" /></div>
              <div class="form-group"><label>Last name</label><input class="form-control" name="lastName" [(ngModel)]="form.lastName" /></div>
              @if (!editing) {
                <div class="form-group"><label>Password *</label><input type="password" class="form-control" name="password" [(ngModel)]="form.password" required /></div>
              }
              <div class="form-group">
                <label>Role</label>
                <select class="form-control" name="role" [(ngModel)]="form.role">
                  @for (r of ROLES; track r) { <option [value]="r">{{ r }}</option> }
                </select>
              </div>
              <div class="form-group"><label>Phone</label><input class="form-control" name="phone" [(ngModel)]="form.phone" /></div>
              <div class="form-group"><label>Gender</label>
                <select class="form-control" name="gender" [(ngModel)]="form.gender">
                  <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-check"><input type="checkbox" class="form-checkbox" name="isActive" [(ngModel)]="form.isActive" /> Active</label>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showForm = false">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (confirmUser) {
      <app-confirm-dialog title="Delete user" [message]="'Delete ' + confirmUser.email + '?'" (confirm)="doDelete()" (close)="confirmUser = null" />
    }
  `,
})
export class UsersComponent implements OnInit {
  readonly ROLES = USER_ROLES;
  users: User[] = [];
  total = 0;
  page = 1;
  pageSize = 15;
  search = '';
  roleFilter = '';
  showForm = false;
  editing: boolean | null = null;
  form: Record<string, any> = {};
  saving = false;
  confirmUser: User | null = null;
  canCreate = false;
  canUpdate = false;
  canDelete = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {
    this.canCreate = this.perms.hasPermission('users:create') || this.perms.hasPermission('users:manage');
    this.canUpdate = this.perms.hasPermission('users:update') || this.perms.hasPermission('users:manage');
    this.canDelete = this.perms.hasPermission('users:delete') || this.perms.hasPermission('users:manage');
  }

  ngOnInit(): void {
    this.load();
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize);
  }

  load(): void {
    this.api.get<User[]>('/users', { page: this.page, limit: this.pageSize, q: this.search, ...(this.roleFilter ? { role: this.roleFilter } : {}) }).subscribe({
      next: (res) => {
        this.users = res?.data ?? [];
        this.total = res?.meta?.total ?? this.users.length;
      },
      error: () => {},
    });
  }

  debouncedLoad(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 300);
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page--;
      this.load();
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
      this.load();
    }
  }

  openCreate(): void {
    this.editing = false;
    this.form = { role: 'staff', isActive: true };
    this.showForm = true;
  }

  openEdit(u: User): void {
    this.editing = true;
    this.form = { ...u };
    this.showForm = true;
  }

  save(): void {
    if (this.saving) return;
    this.saving = true;
    const req = this.editing
      ? this.api.put(`/users/${this.form.id}`, this.form)
      : this.api.post('/users', this.form);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.toasts.success(this.editing ? 'User updated' : 'User created');
        this.load();
      },
      error: () => {
        this.saving = false;
      },
    });
  }

  toggleStatus(u: User): void {
    this.api.patch(`/users/${u.id}/status`, { isActive: !u.isActive }).subscribe({
      next: () => {
        this.toasts.success('Status updated');
        this.load();
      },
      error: () => {},
    });
  }

  resetPassword(u: User): void {
    const pw = prompt(`New password for ${u.email} (min 8 chars)`);
    if (!pw || pw.length < 8) return;
    this.api.post(`/users/${u.id}/reset-password`, { newPassword: pw }).subscribe({
      next: () => this.toasts.success('Password reset'),
      error: () => {},
    });
  }

  askDelete(u: User): void {
    this.confirmUser = u;
  }

  doDelete(): void {
    if (!this.confirmUser) return;
    this.api.delete(`/users/${this.confirmUser.id}`).subscribe({
      next: () => {
        this.confirmUser = null;
        this.toasts.success('User deleted');
        this.load();
      },
      error: () => {
        this.confirmUser = null;
      },
    });
  }
}