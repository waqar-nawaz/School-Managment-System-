import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { User } from '../../core/models/user.model';
import { USER_ROLES } from '../../core/constants/roles';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent, IconComponent, TitleCasePipe],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Users</h1>
        <p class="page-subtitle">Manage system accounts, roles, and access.</p>
      </div>
      <div class="page-actions">
        @if (canCreate) {
          <button class="btn btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="15" /> Add user</button>
        }
      </div>
    </div>

    <div class="users-summary">
      <div class="summary-tile summary-tile-primary">
        <span class="summary-icon"><app-icon name="users" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ total }}</strong>
          <small>Total users</small>
        </div>
      </div>
      <div class="summary-tile summary-tile-success">
        <span class="summary-icon"><app-icon name="check-square" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ activeCount }}</strong>
          <small>Active</small>
        </div>
      </div>
      <div class="summary-tile summary-tile-danger">
        <span class="summary-icon"><app-icon name="x" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ total - activeCount }}</strong>
          <small>Disabled</small>
        </div>
      </div>
      <div class="summary-tile summary-tile-neutral">
        <span class="summary-icon"><app-icon name="shield" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ ROLES.length }}</strong>
          <small>Roles</small>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-toolbar users-toolbar">
        <div class="search-box users-search">
          <app-icon name="search" [size]="15" class="search-leading" />
          <input class="form-control" placeholder="Search name, email, username…" [(ngModel)]="search" (ngModelChange)="debouncedLoad()" />
          @if (search) {
            <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear search">
              <app-icon name="x" [size]="14" />
            </button>
          }
        </div>
        <select class="form-control users-filter" [(ngModel)]="roleFilter" (ngModelChange)="onFilterChange()">
          <option value="">All roles</option>
          @for (r of ROLES; track r) { <option [value]="r">{{ r | titlecase }}</option> }
        </select>
        <select class="form-control users-filter" [(ngModel)]="activeFilter" (ngModelChange)="onFilterChange()">
          <option value="">All status</option>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </select>
      </div>

      @if (loading) {
        <div class="users-skeleton-list">
          @for (i of [1,2,3,4,5,6,7,8]; track i) {
            <div class="user-row user-row-skel">
              <div class="avatar-skel"></div>
              <div class="user-row-body">
                <div class="line-skel line-skel-name"></div>
                <div class="line-skel line-skel-email"></div>
              </div>
              <div class="line-skel line-skel-badge"></div>
              <div class="line-skel line-skel-badge"></div>
            </div>
          }
        </div>
      } @else {
        <div class="users-list">
          @for (u of users; track u.id) {
            <div class="user-row" [class.user-row-disabled]="!u.isActive">
              <div class="avatar avatar-{{ roleColor(u.role) }}" [title]="u.role | titlecase">
                {{ initials(u) }}
              </div>
              <div class="user-row-main">
                <div class="user-row-name">
                  <strong>{{ u.firstName }} {{ u.lastName }}</strong>
                  @if (!u.isActive) { <span class="status-pill status-pill-disabled">Disabled</span> }
                  @else { <span class="status-pill status-pill-active">Active</span> }
                </div>
                <div class="user-row-meta">
                  <span class="meta-item" [title]="u.email"><app-icon name="mail" [size]="13" /> {{ u.email }}</span>
                  @if (u.phone) { <span class="meta-item"><app-icon name="phone" [size]="13" /> {{ u.phone }}</span> }
                  <span class="meta-item meta-username"><app-icon name="user" [size]="13" /> {{ u.username }}</span>
                </div>
              </div>
              <div class="user-row-role">
                <span class="role-badge role-badge-{{ roleColor(u.role) }}">{{ u.role | titlecase }}</span>
              </div>
              <div class="user-row-actions">
                @if (canUpdate || canDelete) {
                  <div class="row-menu">
                    <button type="button" class="icon-btn" (click)="toggleRowMenu(u.id, $event)" aria-label="Actions">
                      <app-icon name="more-vertical" [size]="18" />
                    </button>
                    @if (openMenuId === u.id) {
                      <div class="row-menu-list" [style.top.px]="menuPos?.top" [style.right.px]="menuPos?.right" (click)="$event.stopPropagation()">
                        @if (canUpdate) {
                          <button type="button" class="row-menu-item" (click)="openEdit(u); openMenuId = null">
                            <app-icon name="edit" [size]="15" /> Edit profile
                          </button>
                        }
                        @if (canUpdate) {
                          <button type="button" class="row-menu-item" (click)="openResetPassword(u); openMenuId = null">
                            <app-icon name="lock" [size]="15" /> Reset password
                          </button>
                        }
                        @if (canUpdate) {
                          <button type="button" class="row-menu-item" (click)="toggleStatus(u); openMenuId = null">
                            <app-icon [name]="u.isActive ? 'x' : 'check'" [size]="15" /> {{ u.isActive ? 'Disable account' : 'Enable account' }}
                          </button>
                        }
                        @if (canDelete) {
                          <button type="button" class="row-menu-item danger" (click)="askDelete(u); openMenuId = null">
                            <app-icon name="trash" [size]="15" /> Delete
                          </button>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          } @empty {
            <div class="users-empty">
              <div class="users-empty-icon"><app-icon name="users" [size]="28" /></div>
              <strong>{{ hasFilters ? 'No matches' : 'No users yet' }}</strong>
              <span>{{ hasFilters ? 'Try adjusting the search or filters above.' : 'Add the first user to get started.' }}</span>
            </div>
          }
        </div>
      }

      <div class="pagination-bar">
        <span class="pagination-count">Page {{ page }} of {{ totalPages || 1 }} · {{ total }} total</span>
        <div class="page-actions">
          <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="prevPage()">
            <app-icon name="chevron-left" [size]="14" /> Prev
          </button>
          <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="nextPage()">
            Next <app-icon name="chevron-right" [size]="14" />
          </button>
        </div>
      </div>
    </div>

    @if (showForm) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">{{ editing ? 'Edit user' : 'Add user' }}</div>
            <button type="button" class="modal-close" (click)="showForm = false" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <form (ngSubmit)="save(f)" #f="ngForm">
            <div class="form-section">
              <div class="form-section-title"><app-icon name="user" [size]="14" /> Identity</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>First name *</label>
                  <input class="form-control" name="firstName" [(ngModel)]="form.firstName" required #firstName="ngModel" />
                  @if (f.submitted && firstName.invalid) { <div class="field-error">First name is required</div> }
                  @if (fieldErrors['firstName']) { <div class="field-error">{{ fieldErrors['firstName'] }}</div> }
                </div>
                <div class="form-group">
                  <label>Last name *</label>
                  <input class="form-control" name="lastName" [(ngModel)]="form.lastName" required #lastName="ngModel" />
                  @if (f.submitted && lastName.invalid) { <div class="field-error">Last name is required</div> }
                  @if (fieldErrors['lastName']) { <div class="field-error">{{ fieldErrors['lastName'] }}</div> }
                </div>
              </div>
            </div>

            <div class="form-section">
              <div class="form-section-title"><app-icon name="mail" [size]="14" /> Contact &amp; login</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Username *</label>
                  <input class="form-control" name="username" [(ngModel)]="form.username" required #username="ngModel" />
                  @if (f.submitted && username.invalid) { <div class="field-error">Username is required</div> }
                  @if (fieldErrors['username']) { <div class="field-error">{{ fieldErrors['username'] }}</div> }
                </div>
                <div class="form-group">
                  <label>Email *</label>
                  <input class="form-control" name="email" [(ngModel)]="form.email" required email #email="ngModel" />
                  @if (f.submitted && email.invalid) { <div class="field-error">Enter a valid email address</div> }
                  @if (fieldErrors['email']) { <div class="field-error">{{ fieldErrors['email'] }}</div> }
                </div>
                <div class="form-group">
                  <label>Phone</label>
                  <input class="form-control" name="phone" [(ngModel)]="form.phone" />
                </div>
                <div class="form-group">
                  <label>Gender</label>
                  <select class="form-control" name="gender" [(ngModel)]="form.gender">
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              @if (!editing) {
                <div class="form-grid">
                  <div class="form-group">
                    <label>Password *</label>
                    <div class="password-box">
                      <input [type]="showPassword ? 'text' : 'password'" class="form-control" name="password" [(ngModel)]="form.password" required minlength="8" #password="ngModel" />
                      <button type="button" class="password-toggle" (click)="showPassword = !showPassword" [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
                        <app-icon [name]="showPassword ? 'eye-off' : 'eye'" [size]="16" />
                      </button>
                    </div>
                    @if (f.submitted && password.invalid) { <div class="field-error">Password must be at least 8 characters</div> }
                  </div>
                </div>
              }
            </div>

            <div class="form-section">
              <div class="form-section-title"><app-icon name="shield" [size]="14" /> Role &amp; access</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Role</label>
                  <select class="form-control" name="role" [(ngModel)]="form.role">
                    @for (r of ROLES; track r) { <option [value]="r">{{ r | titlecase }}</option> }
                  </select>
                  @if (isEmployeeRole(form.role)) {
                    <div class="form-hint">An employee profile is created automatically with this login. To also set department, designation and salary in one step, use <strong>Employees → Add employee</strong> instead.</div>
                  }
                </div>
                @if (isSuperAdmin) {
                  <div class="form-group">
                    <label>Branch *</label>
                    <select class="form-control" name="branchId" [(ngModel)]="form.branchId">
                      <option [ngValue]="null">— select —</option>
                      @for (b of branches; track b.id) { <option [ngValue]="b.id">{{ b.name }}</option> }
                    </select>
                    @if (fieldErrors['branchId']) { <div class="field-error">{{ fieldErrors['branchId'] }}</div> }
                  </div>
                }
                <div class="form-group form-group-checkbox">
                  <label class="form-check"><input type="checkbox" class="form-checkbox" name="isActive" [(ngModel)]="form.isActive" /> Active account</label>
                </div>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showForm = false"><app-icon name="x" [size]="14" /> Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save user' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (resetTarget) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">Reset password</div>
            <button type="button" class="modal-close" (click)="resetTarget = null" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <p class="form-hint" style="margin-bottom:1.1rem">
            Set a new password for <strong>{{ resetTarget.email }}</strong>. The user can sign in with it right away.
          </p>
          <form (ngSubmit)="submitResetPassword(rf)" #rf="ngForm">
            <div class="form-group">
              <label>New password *</label>
              <div class="password-box">
                <input [type]="showResetPw ? 'text' : 'password'" class="form-control" name="newPassword" [(ngModel)]="resetPw.newPassword" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters" #rpw="ngModel" />
                <button type="button" class="password-toggle" (click)="showResetPw = !showResetPw" [attr.aria-label]="showResetPw ? 'Hide password' : 'Show password'">
                  <app-icon [name]="showResetPw ? 'eye-off' : 'eye'" [size]="16" />
                </button>
              </div>
              @if (rf.submitted && rpw.invalid) { <div class="field-error">Password must be at least 8 characters</div> }
            </div>
            <div class="form-group">
              <label>Confirm password *</label>
              <div class="password-box">
                <input [type]="showResetPw ? 'text' : 'password'" class="form-control" name="confirm" [(ngModel)]="resetPw.confirm" required autocomplete="new-password" placeholder="Repeat the password" #rcpw="ngModel" />
                <button type="button" class="password-toggle" (click)="showResetPw = !showResetPw" [attr.aria-label]="showResetPw ? 'Hide password' : 'Show password'">
                  <app-icon [name]="showResetPw ? 'eye-off' : 'eye'" [size]="16" />
                </button>
              </div>
              @if (rf.submitted && (rcpw.invalid || resetMismatch)) {
                <div class="field-error">{{ rcpw.invalid ? 'Please confirm the password' : 'Passwords do not match' }}</div>
              }
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="resetTarget = null">
                <app-icon name="x" [size]="14" /> Cancel
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="resetBusy">
                <app-icon name="check" [size]="14" /> {{ resetBusy ? 'Resetting…' : 'Reset password' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (confirmUser) {
      <app-confirm-dialog title="Delete user" [message]="'Delete ' + confirmUser.email + '?'" (confirm)="doDelete()" (close)="confirmUser = null" />
    }
  `,
  styles: [`
    /* Summary tiles */
    .users-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-tile { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .summary-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; }
    .summary-copy { display: flex; flex-direction: column; line-height: 1.2; }
    .summary-copy strong { font-size: 19px; font-weight: 700; }
    .summary-copy small { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .summary-tile-primary .summary-icon { background: var(--primary-light); color: var(--primary); }
    .summary-tile-success .summary-icon { background: rgba(22,163,74,.12); color: var(--success); }
    .summary-tile-danger .summary-icon { background: rgba(192,57,43,.12); color: var(--danger); }
    .summary-tile-neutral .summary-icon { background: var(--neutral-100); color: var(--text-muted); }
    body.dark-theme .summary-tile-success .summary-icon { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .summary-tile-danger .summary-icon { background: rgba(192,57,43,.22); color: #fca5a5; }

    /* Toolbar */
    .users-toolbar { gap: 10px; }
    .users-search { flex: 1; position: relative; }
    .search-leading { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .users-search .form-control { padding-left: 32px; }
    .users-filter { max-width: 170px; }

    /* Users list */
    .users-list { display: flex; flex-direction: column; }
    .user-row { display: grid; grid-template-columns: 44px 1fr 130px 56px; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--border); transition: background .15s; }
    .user-row:last-child { border-bottom: 0; }
    .user-row:hover { background: var(--row-hover); }
    .user-row-disabled { opacity: .65; }

    .avatar { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: #fff; text-transform: uppercase; letter-spacing: .02em; }
    .avatar-admin { background: #c0392b; }
    .avatar-super_admin { background: #6c3483; }
    .avatar-principal { background: #145374; }
    .avatar-teacher { background: #1f6feb; }
    .avatar-staff { background: #5d6d7e; }
    .avatar-student { background: #16a34a; }
    .avatar-parent { background: #d97706; }
    .avatar-accountant { background: #0e7490; }
    .avatar-librarian { background: #b03a2e; }
    .avatar-hostel_warden { background: #2874a6; }
    .avatar-transport_manager { background: #884ea0; }
    .avatar-receptionist { background: #16a085; }
    .avatar-default { background: var(--neutral-500); }

    .user-row-main { min-width: 0; }
    .user-row-name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .user-row-name strong { font-size: 14px; font-weight: 600; color: var(--text); }
    .status-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
    .status-pill-active { background: rgba(22,163,74,.12); color: var(--success); }
    .status-pill-disabled { background: rgba(192,57,43,.12); color: var(--danger); }
    body.dark-theme .status-pill-active { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .status-pill-disabled { background: rgba(192,57,43,.22); color: #fca5a5; }

    .user-row-meta { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 4px; font-size: 12px; color: var(--text-muted); }
    .meta-item { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
    .meta-item span, .meta-item { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
    .meta-item app-icon { flex-shrink: 0; }
    .meta-username { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 11px; }

    .user-row-role { display: flex; justify-content: flex-end; }
    .role-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
    .role-badge-admin { background: rgba(192,57,43,.12); color: #c0392b; }
    .role-badge-super_admin { background: rgba(108,52,131,.14); color: #6c3483; }
    .role-badge-principal { background: var(--primary-light); color: var(--primary); }
    .role-badge-teacher { background: rgba(31,111,235,.12); color: #1f6feb; }
    .role-badge-staff { background: var(--neutral-100); color: var(--text-muted); }
    .role-badge-student { background: rgba(22,163,74,.12); color: #16a34a; }
    .role-badge-parent { background: rgba(217,119,6,.12); color: #d97706; }
    .role-badge-accountant { background: rgba(14,116,144,.12); color: #0e7490; }
    .role-badge-librarian { background: rgba(176,58,46,.12); color: #b03a2e; }
    .role-badge-hostel_warden { background: rgba(40,116,166,.12); color: #2874a6; }
    .role-badge-transport_manager { background: rgba(136,78,160,.12); color: #884ea0; }
    .role-badge-receptionist { background: rgba(22,160,133,.12); color: #16a085; }
    .role-badge-default { background: var(--neutral-100); color: var(--text-muted); }
    body.dark-theme .role-badge-teacher { background: rgba(31,111,235,.22); color: #93c5fd; }
    body.dark-theme .role-badge-student { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .role-badge-parent { background: rgba(217,119,6,.22); color: #fcd34d; }
    body.dark-theme .role-badge-admin { background: rgba(192,57,43,.22); color: #fca5a5; }
    body.dark-theme .role-badge-super_admin { background: rgba(108,52,131,.28); color: #d8a8e8; }

    .user-row-actions { display: flex; justify-content: flex-end; }

    /* Empty state */
    .users-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 56px 24px; text-align: center; }
    .users-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .users-empty strong { font-size: 14px; color: var(--text); }
    .users-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; }

    /* Skeleton */
    .users-skeleton-list { display: flex; flex-direction: column; }
    .user-row-skel { border-bottom: 1px solid var(--border); padding: 12px 16px; }
    .user-row-skel:last-child { border-bottom: 0; }
    .avatar-skel { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: users-shimmer 1.4s ease infinite; }
    .line-skel { height: 10px; border-radius: 4px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: users-shimmer 1.4s ease infinite; }
    .user-row-body { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .line-skel-name { width: 180px; }
    .line-skel-email { width: 240px; height: 9px; }
    .line-skel-badge { width: 80px; }
    @keyframes users-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    /* Pagination */
    .pagination-count { color: var(--text-muted); font-size: 12px; }

    /* Form sections */
    .form-section { padding: 14px 18px 4px; border-bottom: 1px solid var(--border); }
    .form-section:last-of-type { border-bottom: 0; }
    .form-section-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin-bottom: 10px; }
    .form-section-title app-icon { color: var(--primary); }
    .form-section .form-grid { padding: 0; }
    .form-group-checkbox { display: flex; align-items: flex-end; padding-bottom: 12px; }

    @media (max-width: 900px) {
      .users-summary { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 760px) {
      .users-toolbar { flex-wrap: wrap; }
      .users-filter { max-width: none; flex: 1 1 calc(50% - 5px); }
      .user-row { grid-template-columns: 40px 1fr 48px; gap: 10px; padding: 12px; }
      .user-row-role { display: none; }
      .user-row-meta { gap: 8px; }
      .meta-item { max-width: 100%; }
    }
    @media (max-width: 560px) {
      .users-summary { grid-template-columns: 1fr 1fr; }
      .user-row-meta .meta-username { display: none; }
    }
  `],
})
export class UsersComponent implements OnInit {
  /** Starts with the built-in roles, then replaced by the real list from the server (includes custom roles + staff). */
  ROLES: string[] = [...USER_ROLES];
  users: User[] = [];
  total = 0;
  activeCount = 0;
  page = 1;
  pageSize = 15;
  search = '';
  roleFilter = '';
  activeFilter = '';
  loading = true;
  private readonly EMPLOYEE_ROLES = ['teacher', 'staff', 'accountant', 'librarian', 'hostel_warden', 'transport_manager', 'receptionist', 'principal'];
  isEmployeeRole(role: string): boolean { return this.EMPLOYEE_ROLES.includes(role); }
  showForm = false;
  editing: boolean | null = null;
  form: Record<string, any> = {};
  saving = false;
  showPassword = false;
  openMenuId: number | null = null;
  menuPos: { top: number; right: number } | null = null;
  resetTarget: User | null = null;
  resetPw = { newPassword: '', confirm: '' };
  resetBusy = false;
  resetMismatch = false;
  showResetPw = false;
  confirmUser: User | null = null;
  canCreate = false;
  canUpdate = false;
  canDelete = false;
  isSuperAdmin = false;
  branches: Array<{ id: number; name: string }> = [];
  fieldErrors: Record<string, string> = {};
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {
    this.canCreate = this.perms.hasPermission('users:create') || this.perms.hasPermission('users:manage');
    this.canUpdate = this.perms.hasPermission('users:update') || this.perms.hasPermission('users:manage');
    this.canDelete = this.perms.hasPermission('users:delete') || this.perms.hasPermission('users:manage');
    // NOTE: only super_admin (not admin) sees the branch dropdown — admin's branchId is
    // forced server-side anyway, so showing them the dropdown is misleading UX.
    this.isSuperAdmin = perms.role === 'super_admin';
  }

  ngOnInit(): void {
    this.api.get<Array<{ name: string }>>('/roles', { limit: 100 }).subscribe({
      next: (r) => {
        const names = (r?.data ?? []).map((x) => x.name).filter((n) => n && n !== 'super_admin' || this.isSuperAdmin);
        if (names.length) this.ROLES = names;
      },
      error: () => {},
    });
    this.load();
    if (this.isSuperAdmin) this.loadBranches();
  }

  private loadBranches(): void {
    this.api.get<Array<{ id: number; name: string; isActive: boolean }>>('/branches', { page: 1, limit: 100 }).subscribe({
      next: (res) => { this.branches = (res?.data ?? []).filter((b) => b.isActive); },
      error: () => {},
    });
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize);
  }

  get hasFilters(): boolean {
    return !!(this.search || this.roleFilter || this.activeFilter);
  }

  /** Map a role string to a CSS color token used by both avatar and role-badge classes.
   *  Falls back to 'default' for unknown roles so the UI never breaks for custom roles. */
  roleColor(role: string): string {
    const known = ['super_admin', 'admin', 'principal', 'teacher', 'staff', 'student', 'parent', 'accountant', 'librarian', 'hostel_warden', 'transport_manager', 'receptionist'];
    return known.includes(role) ? role : 'default';
  }

  /** Two-letter initials from the user's name; falls back to username or role initial. */
  initials(u: User): string {
    const f = (u.firstName || '').trim().charAt(0);
    const l = (u.lastName || '').trim().charAt(0);
    if (f && l) return (f + l).toUpperCase();
    if (f) return f.toUpperCase();
    if (u.username) return u.username.charAt(0).toUpperCase();
    return '?';
  }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.pageSize, q: this.search };
    if (this.roleFilter) params['role'] = this.roleFilter;
    if (this.activeFilter) params['isActive'] = this.activeFilter;
    this.api.get<User[]>('/users', params).subscribe({
      next: (res) => {
        this.users = res?.data ?? [];
        this.total = res?.meta?.total ?? this.users.length;
        // Active count derived from the loaded page. (The API doesn't return a school-wide
        // active count, so this is a page-level estimate — accurate when no filters are set
        // and visible users reflect the entire result set.)
        this.activeCount = this.users.filter(u => u.isActive).length;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  clearSearch(): void {
    this.search = '';
    this.page = 1;
    this.load();
  }

  debouncedLoad(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 300);
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.load(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages) { this.page++; this.load(); }
  }

  toggleRowMenu(id: number | undefined, event: Event): void {
    event.stopPropagation();
    if (id === undefined) return;
    if (this.openMenuId === id) { this.openMenuId = null; return; }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
    this.openMenuId = id;
  }

  @HostListener('document:click')
  closeRowMenu(): void {
    this.openMenuId = null;
  }

  openCreate(): void {
    this.editing = false;
    this.form = { role: 'teacher', isActive: true };
    this.showPassword = false;
    this.showForm = true;
  }

  openEdit(u: User): void {
    this.editing = true;
    this.form = { ...u };
    this.showPassword = false;
    this.showForm = true;
  }

  save(form: NgForm): void {
    if (this.saving) return;
    if (form.invalid) { form.form.markAllAsTouched(); return; }
    this.saving = true;

    const payload: Record<string, unknown> = {
      firstName: this.form['firstName'] ?? '',
      lastName: this.form['lastName'] ?? '',
      username: this.form['username'],
      email: this.form['email'],
      role: this.form['role'],
      isActive: !!this.form['isActive'],
      phone: this.form['phone'] ? this.form['phone'] : null,
      gender: this.form['gender'] ? this.form['gender'] : null,
      branchId:
        this.form['branchId'] === null || this.form['branchId'] === undefined || this.form['branchId'] === ''
          ? null
          : Number(this.form['branchId']),
    };
    if (!this.editing) payload['password'] = this.form['password'];

    this.fieldErrors = {};
    const req = this.editing
      ? this.api.put(`/users/${this.form['id']}`, payload)
      : this.api.post('/users', payload);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.toasts.success(this.editing ? 'User updated' : 'User created');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        const errs = err?.error?.errors;
        if (Array.isArray(errs)) {
          for (const e of errs) {
            if (e?.path) this.fieldErrors[e.path] = e.message ?? 'Invalid value';
          }
        }
      },
    });
  }

  toggleStatus(u: User): void {
    this.api.patch(`/users/${u.id}/status`, { isActive: !u.isActive }).subscribe({
      next: () => { this.toasts.success('Status updated'); this.load(); },
      error: () => {},
    });
  }

  openResetPassword(u: User): void {
    this.resetTarget = u;
    this.resetPw = { newPassword: '', confirm: '' };
    this.resetMismatch = false;
    this.showResetPw = false;
  }

  submitResetPassword(form: NgForm): void {
    this.resetMismatch = false;
    if (form.invalid) { form.form.markAllAsTouched(); return; }
    if (this.resetPw.newPassword !== this.resetPw.confirm) { this.resetMismatch = true; return; }
    if (!this.resetTarget) return;
    this.resetBusy = true;
    this.api.post(`/users/${this.resetTarget.id}/reset-password`, { newPassword: this.resetPw.newPassword }).subscribe({
      next: () => {
        this.resetBusy = false;
        this.resetTarget = null;
        this.toasts.success('Password reset');
      },
      error: () => { this.resetBusy = false; },
    });
  }

  askDelete(u: User): void { this.confirmUser = u; }

  doDelete(): void {
    if (!this.confirmUser) return;
    this.api.delete(`/users/${this.confirmUser.id}`).subscribe({
      next: (res) => {
        this.confirmUser = null;
        this.toasts.success(res?.message || 'User deleted');
        this.load();
      },
      error: () => { this.confirmUser = null; },
    });
  }
}
