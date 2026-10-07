import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface RoleRow { name: string; label?: string; isSystem?: boolean; description?: string }
interface Group { name: string; keys: string[] }

/** Map a permission category (e.g. 'students', 'invoices') to an icon name.
 *  Used to give each permission group card a small visual identity. */
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
  receipts: 'file-text', refunds: 'trending-down',
};

/** Map a permission action (e.g. 'read', 'create', 'update', 'delete') to a
 *  CSS class token so each action chip is colored by its intent. */
const ACTION_COLOR: Record<string, string> = {
  read: 'action-read', view: 'action-read',
  create: 'action-create', add: 'action-create', new: 'action-create', store: 'action-create',
  update: 'action-update', edit: 'action-update', patch: 'action-update',
  delete: 'action-delete', remove: 'action-delete', destroy: 'action-delete',
  approve: 'action-approve', pay: 'action-approve', send: 'action-approve',
  export: 'action-export', download: 'action-export',
  manage: 'action-manage',
};

@Component({
  selector: 'app-role-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Roles &amp; Permissions</h1>
        <p class="page-subtitle">Choose a role, tick what it is allowed to do, then save. Changes apply immediately.</p>
      </div>
      @if (canEdit) {
        <div class="page-actions">
          <button class="btn btn-primary" (click)="showNew = true"><app-icon name="plus" [size]="15" /> New role</button>
        </div>
      }
    </div>

    <div class="rp-summary">
      <div class="summary-tile summary-tile-primary">
        <span class="summary-icon"><app-icon name="shield" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ roles.length }}</strong>
          <small>Roles defined</small>
        </div>
      </div>
      <div class="summary-tile summary-tile-info">
        <span class="summary-icon"><app-icon name="lock" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ catalogue.length }}</strong>
          <small>Total permissions</small>
        </div>
      </div>
      <div class="summary-tile summary-tile-success">
        <span class="summary-icon"><app-icon name="check-square" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ selected ? coveragePct : 0 }}%</strong>
          <small>{{ selected ? pretty(selected) : 'No role' }} coverage</small>
        </div>
      </div>
      <div class="summary-tile summary-tile-neutral">
        <span class="summary-icon"><app-icon name="users" [size]="18" /></span>
        <div class="summary-copy">
          <strong>{{ systemRoleCount }}</strong>
          <small>System roles</small>
        </div>
      </div>
    </div>

    <div class="rp-layout">
      <aside class="rp-roles">
        <div class="rp-roles-head">
          <span>Roles</span>
          @if (loading) { <span class="rp-spinner"></span> }
        </div>
        @if (loading && !roles.length) {
          @for (i of [1,2,3,4,5,6,7]; track i) {
            <div class="rp-role-skel">
              <div class="avatar-skel-sm"></div>
              <div class="line-skel-sm"></div>
            </div>
          }
        } @else {
          @for (r of roles; track r.name) {
            <button type="button" class="rp-role" [class.active]="r.name === selected" (click)="select(r.name)">
              <span class="rp-role-avatar rp-role-avatar-{{ roleColor(r.name) }}" [title]="pretty(r.name)">
                {{ initials(r) }}
              </span>
              <span class="rp-role-info">
                <span class="rp-role-name">
                  {{ r.label || pretty(r.name) }}
                  @if (r.isSystem) { <span class="rp-system-badge">system</span> }
                </span>
                <span class="rp-role-meta">{{ countOf(r.name) }}</span>
              </span>
            </button>
          } @empty { <div class="rp-roles-empty">No roles found.</div> }
        }
      </aside>

      <main class="card rp-editor">
        @if (!selected) {
          <div class="rp-empty">
            <div class="rp-empty-icon"><app-icon name="shield" [size]="28" /></div>
            <strong>Select a role</strong>
            <span>Choose a role on the left to view or edit its permissions.</span>
          </div>
        } @else if (loading) {
          <div class="rp-skel-grid">
            @for (i of [1,2,3,4]; track i) { <div class="rp-group-skel"></div> }
          </div>
        } @else {
          <header class="rp-editor-head">
            <div class="rp-editor-head-main">
              <div class="rp-editor-title">
                <span class="rp-editor-icon rp-role-avatar-{{ roleColor(selected) }}">
                  <app-icon [name]="categoryIcon(selected)" [size]="18" />
                </span>
                <div>
                  <h2>{{ pretty(selected) }}</h2>
                  @if (fullAccess) {
                    <span class="rp-access-pill rp-access-pill-full">Full access</span>
                  } @else {
                    <span class="rp-access-pill rp-access-pill-partial">{{ draft.size }} of {{ catalogue.length }} permissions</span>
                  }
                </div>
              </div>
              @if (fullAccess) {
                <p class="form-hint">This role has full access to everything and cannot be restricted.</p>
              } @else if (!canEdit) {
                <p class="form-hint">You can view but not change permissions for this role.</p>
              }
            </div>
            @if (!fullAccess) {
              <div class="rp-editor-tools">
                <div class="search-box">
                  <app-icon name="search" [size]="15" class="search-leading" />
                  <input class="form-control" placeholder="Search permissions…" [(ngModel)]="filter" />
                </div>
              </div>
            }
          </header>

          @if (!fullAccess) {
            @if (catalogue.length === 0) {
              <div class="rp-empty">
                <div class="rp-empty-icon"><app-icon name="lock" [size]="28" /></div>
                <strong>No permissions available</strong>
                <span>The permissions catalogue is empty. New permissions appear here automatically when modules are added.</span>
              </div>
            } @else {
              <div class="rp-groups">
                @for (g of visibleGroups(); track g.name) {
                  <div class="rp-group" [class.rp-group-collapsed]="collapsedGroups.has(g.name)">
                    <div class="rp-group-head">
                      <button type="button" class="rp-group-toggle" (click)="toggleGroupCollapse(g.name)" [attr.aria-label]="collapsedGroups.has(g.name) ? 'Expand' : 'Collapse'">
                        <app-icon name="chevron-right" [size]="14" />
                      </button>
                      <span class="rp-group-icon"><app-icon [name]="categoryIcon(g.name)" [size]="16" /></span>
                      <span class="rp-group-name">{{ pretty(g.name) }}</span>
                      <span class="rp-group-count">{{ groupOnCount(g) }}/{{ g.keys.length }}</span>
                      <div class="rp-group-progress" [title]="groupOnCount(g) + ' of ' + g.keys.length + ' enabled'">
                        <span [style.width.%]="g.keys.length ? groupOnCount(g) / g.keys.length * 100 : 0"></span>
                      </div>
                      @if (canEdit) {
                        <button type="button" class="btn btn-xs btn-ghost" (click)="toggleGroup(g)">
                          {{ allOn(g) ? 'Clear all' : 'Select all' }}
                        </button>
                      }
                    </div>
                    @if (!collapsedGroups.has(g.name)) {
                      <div class="rp-keys">
                        @for (k of g.keys; track k) {
                          <button type="button" class="rp-action {{ actionColor(k) }}" [class.on]="draft.has(k)" [disabled]="!canEdit" (click)="canEdit && toggle(k)">
                            <span class="rp-action-check">
                              @if (draft.has(k)) { <app-icon name="check" [size]="12" /> }
                            </span>
                            <span class="rp-action-label">{{ action(k) }}</span>
                          </button>
                        }
                      </div>
                    }
                  </div>
                } @empty {
                  <div class="rp-empty">
                    <div class="rp-empty-icon"><app-icon name="search" [size]="28" /></div>
                    <strong>No matches</strong>
                    <span>No permissions match “{{ filter }}”. Try a different search term.</span>
                  </div>
                }
              </div>
            }

            @if (canEdit) {
              <div class="rp-save-bar">
                <span class="rp-save-status">
                  @if (dirty) {
                    <span class="rp-unsaved-dot"></span>
                    {{ unsavedCount }} unsaved {{ unsavedCount === 1 ? 'change' : 'changes' }}
                  } @else {
                    <app-icon name="check" [size]="14" />
                    <span>All changes saved</span>
                  }
                </span>
                <div class="rp-save-actions">
                  <button class="btn btn-ghost" [disabled]="!dirty || saving" (click)="reset()">
                    <app-icon name="refresh" [size]="14" /> Undo
                  </button>
                  <button class="btn btn-primary" [disabled]="!dirty || saving" (click)="save()">
                    <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save permissions' }}
                  </button>
                </div>
              </div>
            }
          }
        }
      </main>
    </div>

    @if (showNew) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">New role</div>
            <button type="button" class="modal-close" (click)="showNew = false" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Role name *</label>
              <input class="form-control" [(ngModel)]="newName" placeholder="exam_officer" />
              <div class="form-hint">Lowercase letters, numbers and underscores. Must start with a letter.</div>
              @if (newName && !validNewName) { <div class="field-error">Invalid role name format.</div> }
            </div>
            <div class="form-group">
              <label>Display label</label>
              <input class="form-control" [(ngModel)]="newLabel" placeholder="Exam Officer" />
              <div class="form-hint">Human-readable name shown in the UI.</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="showNew = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="!validNewName" (click)="createRole()">
              <app-icon name="check" [size]="14" /> Create role
            </button>
          </div>
        </div>
      </div>
    }

    @if (confirmLeave) {
      <app-confirm-dialog
        title="Discard changes?"
        message="You have unsaved permission changes for this role. Discard them?"
        (confirm)="doLeave()"
        (close)="confirmLeave = null" />
    }
  `,
  styles: [`
    /* Summary tiles */
    .rp-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
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

    /* Layout */
    .rp-layout { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }

    /* Roles sidebar */
    .rp-roles { display: flex; flex-direction: column; gap: 4px; position: sticky; top: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 10px; max-height: calc(100vh - 32px); overflow-y: auto; }
    .rp-roles-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
    .rp-spinner { width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: rp-spin .7s linear infinite; }
    @keyframes rp-spin { to { transform: rotate(360deg); } }
    .rp-role { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; background: transparent; border-radius: 10px; cursor: pointer; text-align: left; color: inherit; transition: background .15s; }
    .rp-role:hover { background: var(--row-hover); }
    .rp-role.active { background: var(--primary-light); }
    .rp-role-avatar { width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: #fff; text-transform: uppercase; flex-shrink: 0; letter-spacing: .02em; }
    .rp-role-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .rp-role-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rp-role.active .rp-role-name { color: var(--primary); }
    .rp-system-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 1px 5px; border-radius: 4px; background: var(--neutral-100); color: var(--text-muted); }
    .rp-role.active .rp-system-badge { background: rgba(255,255,255,.6); color: var(--primary); }
    body.dark-theme .rp-role.active .rp-system-badge { background: rgba(255,255,255,.15); }
    .rp-role-meta { font-size: 11px; color: var(--text-muted); }
    .rp-roles-empty { padding: 24px 12px; text-align: center; font-size: 12px; color: var(--text-muted); }

    /* Role avatar colors (same palette as users tab) */
    .rp-role-avatar-admin { background: #c0392b; }
    .rp-role-avatar-principal { background: #145374; }
    .rp-role-avatar-teacher { background: #1f6feb; }
    .rp-role-avatar-staff { background: #5d6d7e; }
    .rp-role-avatar-student { background: #16a34a; }
    .rp-role-avatar-parent { background: #d97706; }
    .rp-role-avatar-accountant { background: #0e7490; }
    .rp-role-avatar-librarian { background: #b03a2e; }
    .rp-role-avatar-hostel_warden { background: #2874a6; }
    .rp-role-avatar-transport_manager { background: #884ea0; }
    .rp-role-avatar-receptionist { background: #16a085; }
    .rp-role-avatar-default { background: var(--neutral-500); }

    /* Editor */
    .rp-editor { padding: 0; overflow: hidden; }
    .rp-editor-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .rp-editor-head-main { flex: 1; min-width: 0; }
    .rp-editor-title { display: flex; align-items: center; gap: 12px; }
    .rp-editor-icon { width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
    .rp-editor-title h2 { margin: 0; font-size: 18px; font-weight: 700; }
    .rp-access-pill { display: inline-flex; align-items: center; margin-top: 3px; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
    .rp-access-pill-full { background: rgba(108,52,131,.14); color: #6c3483; }
    .rp-access-pill-partial { background: var(--primary-light); color: var(--primary); }
    body.dark-theme .rp-access-pill-full { background: rgba(108,52,131,.28); color: #d8a8e8; }
    .rp-editor-tools { flex-shrink: 0; }
    .rp-editor-tools .search-box { position: relative; }
    .rp-editor-tools .search-leading { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .rp-editor-tools .form-control { padding-left: 32px; min-width: 240px; }

    /* Permission groups */
    .rp-groups { padding: 14px 20px 80px; display: flex; flex-direction: column; gap: 12px; }
    .rp-group { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
    .rp-group-head { display: flex; align-items: center; gap: 10px; padding: 11px 14px; background: var(--neutral-50); border-bottom: 1px solid var(--border); }
    body.dark-theme .rp-group-head { background: rgba(255,255,255,.02); }
    .rp-group-toggle { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: 6px; transition: transform .15s, background .15s; flex-shrink: 0; }
    .rp-group-toggle:hover { background: var(--neutral-100); }
    .rp-group-collapsed .rp-group-toggle { transform: rotate(0deg); }
    .rp-group:not(.rp-group-collapsed) .rp-group-toggle { transform: rotate(90deg); }
    .rp-group-icon { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: var(--primary-light); color: var(--primary); flex-shrink: 0; }
    .rp-group-name { font-size: 13px; font-weight: 700; color: var(--text); flex: 1; min-width: 0; }
    .rp-group-count { font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 2px 8px; background: var(--neutral-100); border-radius: 999px; flex-shrink: 0; }
    .rp-group-progress { width: 80px; height: 5px; border-radius: 999px; background: var(--neutral-100); overflow: hidden; flex-shrink: 0; }
    .rp-group-progress span { display: block; height: 100%; background: var(--primary); border-radius: inherit; transition: width .2s ease; }
    .btn-xs { font-size: 11px; padding: 4px 8px; }

    /* Action chips */
    .rp-keys { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px; }
    .rp-action { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px 6px 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); cursor: pointer; font-size: 12px; font-weight: 600; color: var(--text-muted); transition: all .15s; }
    .rp-action:hover:not(:disabled) { border-color: var(--primary); color: var(--text); }
    .rp-action:disabled { cursor: not-allowed; opacity: .55; }
    .rp-action-check { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--border); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; transition: all .15s; }
    .rp-action-label { text-transform: capitalize; }

    .rp-action.on { color: var(--text); border-color: var(--primary); }
    .rp-action.on .rp-action-check { background: var(--primary); border-color: var(--primary); }

    /* Action-type semantic colors when ON */
    .rp-action.action-read.on { border-color: #1f6feb; }
    .rp-action.action-read.on .rp-action-check { background: #1f6feb; border-color: #1f6feb; }
    .rp-action.action-create.on { border-color: #16a34a; }
    .rp-action.action-create.on .rp-action-check { background: #16a34a; border-color: #16a34a; }
    .rp-action.action-update.on { border-color: #d97706; }
    .rp-action.action-update.on .rp-action-check { background: #d97706; border-color: #d97706; }
    .rp-action.action-delete.on { border-color: #c0392b; }
    .rp-action.action-delete.on .rp-action-check { background: #c0392b; border-color: #c0392b; }
    .rp-action.action-approve.on { border-color: #6c3483; }
    .rp-action.action-approve.on .rp-action-check { background: #6c3483; border-color: #6c3483; }
    .rp-action.action-export.on { border-color: #0e7490; }
    .rp-action.action-export.on .rp-action-check { background: #0e7490; border-color: #0e7490; }
    .rp-action.action-manage.on { border-color: #145374; }
    .rp-action.action-manage.on .rp-action-check { background: #145374; border-color: #145374; }

    /* Save bar */
    .rp-save-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; background: var(--surface); border-top: 1px solid var(--border); position: sticky; bottom: 0; backdrop-filter: blur(6px); }
    .rp-save-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
    .rp-unsaved-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warning); animation: rp-pulse 1.6s ease-in-out infinite; }
    @keyframes rp-pulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
    .rp-save-actions { display: flex; gap: 8px; }

    /* Empty state */
    .rp-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 60px 24px; text-align: center; }
    .rp-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .rp-empty strong { font-size: 14px; color: var(--text); }
    .rp-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; line-height: 1.4; }

    /* Skeletons */
    .rp-role-skel { display: flex; align-items: center; gap: 10px; padding: 9px 10px; }
    .avatar-skel-sm { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: rp-shimmer 1.4s ease infinite; flex-shrink: 0; }
    .line-skel-sm { flex: 1; height: 12px; border-radius: 4px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: rp-shimmer 1.4s ease infinite; }
    .rp-skel-grid { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
    .rp-group-skel { height: 60px; border-radius: 12px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: rp-shimmer 1.4s ease infinite; }
    @keyframes rp-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    /* Responsive */
    @media (max-width: 1000px) {
      .rp-summary { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 800px) {
      .rp-layout { grid-template-columns: 1fr; }
      .rp-roles { position: static; max-height: none; }
      .rp-roles-head { display: none; }
      .rp-role { display: inline-flex; }
      .rp-roles { flex-direction: row; overflow-x: auto; padding: 8px; }
      .rp-role { white-space: nowrap; width: auto; flex-shrink: 0; }
      .rp-editor-head { flex-direction: column; align-items: stretch; }
      .rp-editor-tools .form-control { min-width: 0; width: 100%; }
      .rp-group-progress { display: none; }
    }
    @media (max-width: 560px) {
      .rp-summary { grid-template-columns: 1fr 1fr; }
      .rp-group-count { display: none; }
      .rp-save-bar { flex-direction: column; align-items: stretch; }
      .rp-save-actions { justify-content: stretch; }
      .rp-save-actions .btn { flex: 1; }
    }
  `],
})
export class RolePermissionsComponent implements OnInit {
  roles: RoleRow[] = [];
  matrix: Record<string, string[]> = {};
  catalogue: string[] = [];
  selected = '';
  draft = new Set<string>();
  filter = '';
  loading = true;
  saving = false;
  showNew = false;
  newName = '';
  newLabel = '';
  confirmLeave: string | null = null;
  collapsedGroups = new Set<string>();

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {}

  get canEdit(): boolean { return this.perms.hasPermission('roles:update') && !this.fullAccess; }
  get fullAccess(): boolean { return (this.matrix[this.selected] ?? []).includes('*'); }
  get validNewName(): boolean { return /^[a-z][a-z0-9_]{1,48}$/.test(this.newName); }
  get dirty(): boolean {
    const saved = new Set((this.matrix[this.selected] ?? []).filter((k) => k !== '*'));
    if (saved.size !== this.draft.size) return true;
    for (const k of this.draft) if (!saved.has(k)) return true;
    return false;
  }

  /** Count of permission toggles that differ from the saved state — shown as
   *  'N unsaved changes' in the sticky save bar so the user knows what they'd lose. */
  get unsavedCount(): number {
    const saved = new Set((this.matrix[this.selected] ?? []).filter((k) => k !== '*'));
    let n = 0;
    for (const k of this.draft) if (!saved.has(k)) n++;
    for (const k of saved) if (!this.draft.has(k)) n++;
    return n;
  }

  /** Percentage of the catalogue that the currently selected role has enabled. */
  get coveragePct(): number {
    if (!this.catalogue.length) return 0;
    const saved = this.matrix[this.selected] ?? [];
    if (saved.includes('*')) return 100;
    return Math.round((saved.filter((k) => k !== '*').length / this.catalogue.length) * 100);
  }

  /** Count of system-defined roles (excludes user-created custom roles). */
  get systemRoleCount(): number {
    return this.roles.filter((r) => r.isSystem).length;
  }

  ngOnInit(): void { this.load(); }

  load(keepSelection = true): void {
    this.loading = true;
    this.api.get<Array<RoleRow>>('/roles', { limit: 100 }).subscribe({
      next: (r) => (this.roles = (r?.data ?? []).filter((x) => x.name !== 'super_admin')),
      error: () => {},
    });
    this.api.get<Array<{ key: string }>>('/roles/permissions/list').subscribe({
      next: (r) => { this.catalogue = (r?.data ?? []).map((p) => p.key).filter((k) => k !== '*'); this.rebuildCatalogue(); },
      error: () => {},
    });
    this.api.get<Record<string, string[]>>('/roles/matrix').subscribe({
      next: (r) => {
        this.matrix = r?.data ?? {};
        this.loading = false;
        this.rebuildCatalogue();
        const keep = keepSelection && this.selected && this.matrix[this.selected];
        this.select(keep ? this.selected : (this.roles[0]?.name ?? Object.keys(this.matrix).find((n) => n !== 'super_admin') ?? ''), true);
      },
      error: () => (this.loading = false),
    });
  }

  private rebuildCatalogue(): void {
    const all = new Set(this.catalogue);
    for (const list of Object.values(this.matrix)) for (const k of list) if (k !== '*') all.add(k);
    this.catalogue = Array.from(all).sort();
  }

  select(name: string, force = false): void {
    if (!force && name !== this.selected && this.dirty) { this.confirmLeave = name; return; }
    this.selected = name;
    this.reset();
  }
  doLeave(): void { const n = this.confirmLeave; this.confirmLeave = null; if (n) { this.selected = n; this.reset(); } }

  reset(): void {
    this.draft = new Set((this.matrix[this.selected] ?? []).filter((k) => k !== '*'));
  }

  countOf(role: string): string {
    const l = this.matrix[role] ?? [];
    if (l.includes('*')) return 'All access';
    const n = l.length;
    return `${n} ${n === 1 ? 'permission' : 'permissions'}`;
  }

  /** Per-role initials shown in the avatar circle (1-2 letters from role name). */
  initials(r: RoleRow): string {
    const name = (r.label || r.name).replace(/[-_]/g, ' ');
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return name.charAt(0).toUpperCase() + (name.length > 1 ? name.charAt(1) : '');
  }

  /** Map a role name to a CSS color token shared by the avatars (mirrors the
   *  users tab palette so admins see consistent colors across screens). */
  roleColor(role: string): string {
    const known = ['admin', 'principal', 'teacher', 'staff', 'student', 'parent', 'accountant', 'librarian', 'hostel_warden', 'transport_manager', 'receptionist'];
    return known.includes(role) ? role : 'default';
  }

  /** Look up the icon for a permission group (e.g. 'students' → 'users').
   *  Falls back to a generic 'shield' so unknown categories still render an icon. */
  categoryIcon(group: string): string {
    return CATEGORY_ICON[group] ?? 'shield';
  }

  /** Per-action CSS class (read/create/update/delete/approve/etc.) so each chip
   *  is colored by its intent — destructive actions look destructive, view
   *  actions look benign, etc. */
  actionColor(key: string): string {
    const action = key.includes(':') ? key.split(':')[1] : key;
    return ACTION_COLOR[action] ?? 'action-default';
  }

  groups(): Group[] {
    const by = new Map<string, string[]>();
    for (const k of this.catalogue) {
      const g = k.split(':')[0];
      if (!by.has(g)) by.set(g, []);
      by.get(g)!.push(k);
    }
    return Array.from(by, ([name, keys]) => ({ name, keys })).sort((a, b) => a.name.localeCompare(b.name));
  }
  visibleGroups(): Group[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.groups();
    return this.groups().map((g) => ({ name: g.name, keys: g.keys.filter((k) => k.toLowerCase().includes(q)) })).filter((g) => g.keys.length);
  }

  toggle(k: string): void { this.draft.has(k) ? this.draft.delete(k) : this.draft.add(k); this.draft = new Set(this.draft); }
  allOn(g: Group): boolean { return g.keys.every((k) => this.draft.has(k)); }
  groupOnCount(g: Group): number { return g.keys.filter((k) => this.draft.has(k)).length; }
  toggleGroup(g: Group): void {
    const on = this.allOn(g);
    for (const k of g.keys) on ? this.draft.delete(k) : this.draft.add(k);
    this.draft = new Set(this.draft);
  }

  toggleGroupCollapse(name: string): void {
    if (this.collapsedGroups.has(name)) this.collapsedGroups.delete(name);
    else this.collapsedGroups.add(name);
    this.collapsedGroups = new Set(this.collapsedGroups);
  }

  save(): void {
    this.saving = true;
    this.api.put(`/roles/${this.selected}/permissions`, Array.from(this.draft)).subscribe({
      next: () => {
        this.matrix[this.selected] = Array.from(this.draft);
        this.saving = false;
        this.toasts.success(`${this.pretty(this.selected)} permissions saved`);
      },
      error: () => (this.saving = false),
    });
  }

  createRole(): void {
    this.api.post('/roles', { name: this.newName, label: this.newLabel || this.pretty(this.newName) }).subscribe({
      next: () => {
        this.showNew = false;
        const created = this.newName;
        this.newName = ''; this.newLabel = '';
        this.toasts.success('Role created. Now choose what it can do.');
        this.selected = created;
        this.matrix[created] = [];
        this.load();
      },
      error: () => {},
    });
  }

  pretty(s: string): string { return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  action(k: string): string { return k.includes(':') ? k.split(':').slice(1).join(':') : k; }
}
