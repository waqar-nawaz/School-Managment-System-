import { Component, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { switchMap, tap, takeUntil, debounceTime } from 'rxjs/operators';
import { currencyCode } from '../../core/utils/currency';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { FieldConfig, resolveResource, ResourceConfig } from './resource.config';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { RouterLink } from '@angular/router';

interface Row {
  id?: number;
  [key: string]: any;
}

// Backend permission module for resources whose URL key differs from it.
const PERMISSION_BY_RESOURCE: Record<string, string> = {
  'academic-years': 'academic',
  terms: 'academic',
  'class-subjects': 'subjects',
  enrolments: 'students',
  parents: 'students',
  'exam-schedules': 'exams',
  'report-cards': 'exam-results',
  submissions: 'assignments',
  'grade-scales': 'gradebook',
  periods: 'timetable',
  'fee-types': 'fees',
  payslips: 'payroll',
  'book-copies': 'library',
  assets: 'inventory',
  'visitor-logs': 'visitors',
  'health-records': 'health-records',
};

// Resources served by a custom router that has no generic /export endpoint.
const NO_EXPORT = new Set([
  'roles', 'permissions', 'students', 'book-issues', 'certificates', 'media',
  'payments', 'admissions', 'invoices',
]);

@Component({
  selector: 'app-crud-resource',
  standalone: true,
  imports: [FormsModule, CommonModule, ConfirmDialogComponent, RouterLink, IconComponent],
  template: `
    @if (!config) {
      <div class="card">
        <h2>Resource not found</h2>
        <p>This module has not been configured yet.</p>
        <a routerLink="/dashboard" class="btn btn-primary">Back to dashboard</a>
      </div>
    } @else {
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ config.label }}</h1>
          <p class="page-subtitle">{{ config.subtitle ?? ('Manage ' + config.label.toLowerCase()) }}</p>
        </div>
        <div class="page-actions">
          @if (resourceKey === 'media' && canUpload) {
            <button class="btn btn-primary" (click)="fileInput.click()">
              <app-icon name="plus" [size]="15" /> Upload file
            </button>
            <input #fileInput type="file" hidden (change)="onUpload($event)" />
          }
          @if (canExport && rows.length) {
            <button class="btn btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" /> Export CSV</button>
          }
          @if (config.canCreate !== false && canCreate) {
            <button class="btn btn-primary" (click)="openCreate()">
              <app-icon name="plus" [size]="15" /> {{ config.createLabel ?? 'Add new' }}
            </button>
          }
        </div>
      </div>

      <div class="card">
        <div class="card-toolbar">
          @if (resourceKey === 'students') {
            <div style="display:flex;gap:6px;align-items:center;margin-right:12px">
              <button type="button" class="btn btn-sm" [class.btn-primary]="studentStatus === 'active'" [class.btn-ghost]="studentStatus !== 'active'" (click)="setStudentStatus('active')">Active</button>
              <button type="button" class="btn btn-sm" [class.btn-primary]="studentStatus === 'inactive'" [class.btn-ghost]="studentStatus !== 'inactive'" (click)="setStudentStatus('inactive')">Inactive</button>
            </div>
          }
          @if (resourceKey === 'beds') {
            <select class="form-control" style="max-width:180px;margin-right:12px" [(ngModel)]="bedHostelFilter" (ngModelChange)="onBedHostelFilter()">
              <option value="">All hostels</option>
              @for (h of bedHostelOptions; track h.id) { <option [value]="h.id">{{ h.name }}</option> }
            </select>
          }
          <div class="search-box">
            <input
              type="text"
              class="form-control"
              [placeholder]="searchPlaceholder"
              [value]="searchText"
              (input)="onSearch($event)" />
            @if (searchText) {
              <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear search">
                <app-icon name="x" [size]="14" />
              </button>
            }
          </div>
        </div>

        @if (resourceKey === 'beds') {
          <div class="beds-view">
            <div class="beds-view-head">
              <div>
                <div class="beds-view-title">Bed inventory</div>
                <div class="beds-view-subtitle">Beds are grouped by room so the hostel and room name is shown once.</div>
              </div>
              <div class="beds-view-legend" aria-label="Bed status legend">
                <span><i class="beds-dot available"></i> Available</span>
                <span><i class="beds-dot occupied"></i> Occupied</span>
                <span><i class="beds-dot maintenance"></i> Maintenance</span>
              </div>
            </div>
            <div class="beds-room-list">
              @for (group of bedGroups; track group.key) {
                <section class="beds-room-card">
                  <div class="beds-room-head">
                    <div class="beds-room-location">
                      <div class="beds-hostel-name">{{ group.hostelName }}</div>
                      <div class="beds-room-name">Room {{ group.roomNo }}</div>
                    </div>
                    <div class="beds-room-occupancy">
                      <div class="beds-occupancy-label">
                        <span>{{ group.occupied }}/{{ group.total }} occupied</span>
                        <span>{{ group.total - group.occupied }} free</span>
                      </div>
                      <div class="beds-progress" aria-hidden="true">
                        <span [style.width.%]="group.total ? (group.occupied / group.total) * 100 : 0"></span>
                      </div>
                    </div>
                  </div>
                  <div class="beds-room-body">
                    <div class="beds-chip-list">
                      @for (row of group.rows; track row.id) {
                        <div class="beds-chip beds-chip-{{ bedStatusClass(row.status) }}">
                          <span class="beds-chip-status" aria-hidden="true"></span>
                          <div class="beds-chip-copy">
                            <strong>Bed {{ row.bedNo }}</strong>
                            <small>{{ bedStatusLabel(row.status) }}</small>
                          </div>
                          @if (hasActions) {
                            <button type="button" class="beds-chip-menu" (click)="toggleRowMenu(row.id, $event)" aria-label="Bed actions">
                              <app-icon name="more-vertical" [size]="16" />
                            </button>
                            @if (openMenuId === row.id) {
                              <div class="row-menu-list" [style.top.px]="menuPos?.top" [style.right.px]="menuPos?.right" (click)="$event.stopPropagation()">
                                @if (rowEditable) {
                                  <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit</button>
                                }
                                @if (rowDeletable) {
                                  <button type="button" class="row-menu-item danger" (click)="askDelete(row); openMenuId = null"><app-icon name="trash" [size]="15" /> Delete</button>
                                }
                              </div>
                            }
                          }
                        </div>
                      }
                    </div>
                  </div>
                </section>
              } @empty {
                <div class="beds-empty">
                  <div class="beds-empty-icon"><app-icon name="home" [size]="22" /></div>
                  <strong>No beds found</strong>
                  <span>Try another hostel or search term.</span>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  @for (col of config.columns; track col.key) { <th>{{ col.label }}</th> }
                  @if (hasActions) { <th style="width:70px;text-align:right">Actions</th> }
                </tr>
              </thead>
              <tbody>
                @for (row of rows; track trackRow($index, row)) {
                  <tr>
                    @for (col of config.columns; track col.key) {
                      <td>
                        @switch (col.type) {
                          @case ('date') { <span>{{ row[col.key] | date: 'MMM d, y' }}</span> }
                          @case ('datetime') { <span>{{ row[col.key] | date: 'MMM d, y, h:mm a' }}</span> }
                          @case ('money') { <span>{{ money(row[col.key]) }}</span> }
                          @case ('bool') { @if (row[col.key]) {<span class="badge badge-success">Yes</span>} @else {<span class="badge">No</span>} }
                          @case ('badge') { <span class="badge badge-{{ badgeClass(col, row[col.key]) }}">{{ display(col, row[col.key]) }}</span> }
                          @case ('bedSummary') {
                            <span class="bed-summary">
                              @if (row[col.key] && isArray(row[col.key])) {
                                @for (b of row[col.key]; track b.bedNo) {
                                  <span class="badge badge-sm badge-{{ b.status === 'available' ? 'success' : b.status === 'occupied' ? 'danger' : 'warning' }}" title="{{ b.bedNo }}: {{ b.status }}">{{ b.bedNo }}</span>
                                }
                              }
                            </span>
                          }
                          @default { <span>{{ cell(col, row) }}</span> }
                        }
                      </td>
                    }
                    @if (hasActions) {
                      <td style="text-align:right;white-space:nowrap">
                        <div class="row-menu">
                          <button type="button" class="icon-btn" (click)="toggleRowMenu(row.id, $event)" aria-label="Actions"><app-icon name="more-vertical" [size]="18" /></button>
                          @if (openMenuId === row.id) {
                            <div class="row-menu-list" [style.top.px]="menuPos?.top" [style.right.px]="menuPos?.right" (click)="$event.stopPropagation()">
                              @if (rowEditable) {
                                <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit</button>
                              }
                              @if (resourceKey === 'students') {
                                @if (row['isActive'] && canDelete) { <button type="button" class="row-menu-item danger" (click)="askStatusChange(row, 'deactivate'); openMenuId = null"><app-icon name="x" [size]="15" /> Deactivate</button> }
                                @if (!row['isActive'] && canEdit) { <button type="button" class="row-menu-item" (click)="askStatusChange(row, 'activate'); openMenuId = null"><app-icon name="check" [size]="15" /> Activate</button> }
                              } @else if (resourceKey === 'leaves') {
                                @if (row['status'] === 'pending') {
                                  @if (canApproveLeaves) {
                                    <button type="button" class="row-menu-item" (click)="leaveAction(row, 'approved'); openMenuId = null"><app-icon name="check" [size]="15" /> Approve</button>
                                    <button type="button" class="row-menu-item danger" (click)="leaveAction(row, 'rejected'); openMenuId = null"><app-icon name="x" [size]="15" /> Reject</button>
                                  } @else {
                                    <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit dates/reason</button>
                                    <button type="button" class="row-menu-item danger" (click)="leaveAction(row, 'cancelled'); openMenuId = null"><app-icon name="x" [size]="15" /> Cancel request</button>
                                  }
                                } @else if (rowEditable && canApproveLeaves) {
                                  <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit</button>
                                }
                              } @else if (rowDeletable) {
                                <button type="button" class="row-menu-item danger" (click)="askDelete(row); openMenuId = null"><app-icon name="trash" [size]="15" /> Delete</button>
                              }
                            </div>
                          }
                        </div>
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr><td [attr.colspan]="config.columns.length + (hasActions ? 1 : 0)" class="empty-cell">No records found.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }

        <div class="pagination-bar">
          <select class="form-control form-control-sm pagination-size" [ngModel]="pageSize" (ngModelChange)="setPageSize($event)">
            @for (size of [10, 20, 50, 100]; track size) {
              <option [ngValue]="size">{{ size }} / page</option>
            }
          </select>
          <div class="pagination-right">
            <span class="pagination-count">Page {{ page }} of {{ totalPages || 1 }} ({{ total }} records)</span>
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="setPage(page - 1)">
              <app-icon name="chevron-left" [size]="14" /> Prev
            </button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="setPage(page + 1)">
              Next <app-icon name="chevron-right" [size]="14" />
            </button>
          </div>
        </div>
      </div>
    }

    @if (showForm && config) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">{{ editingId ? 'Edit' : formTitle }}</div>
            <button type="button" class="modal-close" (click)="closeForm()" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <form (ngSubmit)="save()" (input)="clearFieldErrors()" #f="ngForm">
            <div class="form-grid">
              @for (field of formFields; track field.key) {
                <div class="form-group" [class.form-group-full]="field.type === 'textarea'">
                  @if (field.type !== 'bool') {
                    <label>{{ field.label }} @if (field.required) {<span class="text-danger"> *</span>}</label>
                  }
                  @switch (field.type) {
                    @case ('textarea') {
                      <textarea class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]"></textarea>
                    }
                    @case ('number') {
                      <input type="number" class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]" />
                    }
                    @case ('bool') {
                      <label class="form-check"><input type="checkbox" class="form-checkbox" name="{{ field.key }}" [(ngModel)]="formValues[field.key]" /> {{ field.label }} @if (field.required) {<span class="text-danger"> *</span>}</label>
                    }
                    @case ('select') {
                      <select class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]">
                        <option [ngValue]="null">— select —</option>
                        @for (opt of field.options ?? []; track opt.value) {
                          <option [ngValue]="opt.value">{{ opt.label }}</option>
                        }
                      </select>
                    }
                    @case ('ref') {
                      <div class="ref-box">
                        <input
                          type="text"
                          class="form-control"
                          placeholder="Type to search…"
                          autocomplete="off"
                          [value]="refLabel(field.key)"
                          (input)="onRefInput(field, $event)"
                          (focus)="openRef(field)"
                          (blur)="onRefBlur(field.key)" />
                        @if (refOpenKey === field.key) {
                          <div class="ref-list">
                            @for (opt of refOptions[field.key] ?? []; track opt.value) {
                              <button type="button" class="ref-item" (mousedown)="selectRef(field.key, opt)">
                                {{ opt.label }}
                              </button>
                            } @empty {
                              <div class="ref-empty">No matches</div>
                            }
                          </div>
                        }
                      </div>
                    }
                    @case ('date') { <input type="date" class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]" /> }
                    @case ('dateonly') { <input type="date" class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]" /> }
                    @default {
                      <input type="text" class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]" />
                    }
                  }
                  @if (fieldErrors[field.key]) {
                    <div class="field-error">{{ fieldErrors[field.key] }}</div>
                  } @else if (field.hint) {
                    <small class="form-hint">{{ field.hint }}</small>
                  }
                </div>
              }
            </div>
            @if (config.fields.length === 0) {
              <p class="form-hint">This module is read-only.</p>
            }
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="closeForm()"><app-icon name="x" [size]="14" /> Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (confirm && config) {
      <app-confirm-dialog
        title="Delete record"
        [message]="'Delete ' + config.label + ' #' + (confirm ? confirm.id : '') + '? This cannot be undone.'"
        (confirm)="doDelete()"
        (close)="confirm = null" />
    }

    @if (leaveConfirm) {
      <app-confirm-dialog
        title="{{ leaveConfirm.action === 'approved' ? 'Approve leave' : leaveConfirm.action === 'rejected' ? 'Reject leave' : 'Cancel leave' }}"
        [message]="'Are you sure you want to ' + (leaveConfirm.action === 'approved' ? 'approve' : leaveConfirm.action === 'rejected' ? 'reject' : 'cancel') + ' this leave request?'"
        [confirmLabel]="leaveConfirm.action === 'approved' ? 'Approve' : leaveConfirm.action === 'rejected' ? 'Reject' : 'Cancel'"
        [danger]="leaveConfirm.action !== 'approved'"
        (confirm)="doLeaveAction()"
        (close)="leaveConfirm = null" />
    }
    @if (statusConfirm && config && resourceKey === 'students') {
      <app-confirm-dialog
        [title]="statusConfirm.action === 'activate' ? 'Activate student' : 'Deactivate student'"
        [message]="(statusConfirm.action === 'activate' ? 'Activate ' : 'Deactivate ') + (statusConfirm.row.firstName || 'student') + ' ' + (statusConfirm.row.lastName || '') + '?'"
        (confirm)="doStatusChange()"
        (close)="statusConfirm = null" />
    }
  `,
  styles: [`
    .beds-view { padding: 4px 0 2px; }
    .beds-view-head { display:flex; align-items:center; justify-content:space-between; gap:18px; margin:0 0 16px; }
    .beds-view-title { font-size:15px; font-weight:700; letter-spacing:-.01em; }
    .beds-view-subtitle { margin-top:3px; font-size:12px; color:var(--text-muted, #667085); }
    .beds-view-legend { display:flex; flex-wrap:wrap; gap:12px; font-size:12px; color:var(--text-muted, #667085); }
    .beds-view-legend span { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
    .beds-dot, .beds-chip-status { width:7px; height:7px; border-radius:50%; display:inline-block; flex:0 0 auto; }
    .beds-dot.available, .beds-chip-success .beds-chip-status { background:#16a34a; }
    .beds-dot.occupied, .beds-chip-danger .beds-chip-status { background:#dc2626; }
    .beds-dot.maintenance, .beds-chip-warning .beds-chip-status { background:#d97706; }
    .beds-room-list { display:grid; gap:12px; }
    .beds-room-card { border:1px solid var(--border-color, #e5e7eb); border-radius:12px; background:var(--surface, #fff); overflow:visible; }
    .beds-room-head { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:14px 16px 12px; border-bottom:1px solid var(--border-color, #eef0f3); }
    .beds-room-location { min-width:180px; }
    .beds-hostel-name { font-size:13px; font-weight:700; color:var(--text, #111827); }
    .beds-room-name { margin-top:3px; font-size:12px; color:var(--text-muted, #667085); }
    .beds-room-occupancy { width:190px; max-width:35%; }
    .beds-occupancy-label { display:flex; justify-content:space-between; gap:8px; margin-bottom:6px; font-size:11px; color:var(--text-muted, #667085); }
    .beds-progress { height:5px; overflow:hidden; border-radius:999px; background:#eef0f3; }
    .beds-progress span { display:block; height:100%; border-radius:inherit; background:#64748b; transition:width .2s ease; }
    .beds-room-body { padding:14px 16px 16px; }
    .beds-chip-list { display:flex; flex-wrap:wrap; gap:9px; }
    .beds-chip { position:relative; min-width:128px; display:flex; align-items:center; gap:9px; padding:9px 8px 9px 11px; border:1px solid var(--border-color, #e5e7eb); border-radius:9px; background:#fafafa; }
    .beds-chip-success { border-color:#bbf7d0; background:#f7fdf8; }
    .beds-chip-danger { border-color:#fecaca; background:#fff8f8; }
    .beds-chip-warning { border-color:#fde68a; background:#fffbeb; }
    .beds-chip-copy { min-width:0; display:flex; flex-direction:column; gap:2px; }
    .beds-chip-copy strong { font-size:12px; line-height:1.2; color:var(--text, #111827); }
    .beds-chip-copy small { font-size:10px; line-height:1.2; text-transform:capitalize; color:var(--text-muted, #667085); }
    .beds-chip-menu { margin-left:auto; width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; border:0; border-radius:6px; background:transparent; color:var(--text-muted, #667085); cursor:pointer; }
    .beds-chip-menu:hover { background:rgba(0,0,0,.05); color:var(--text, #111827); }
    .beds-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; min-height:180px; border:1px dashed var(--border-color, #d9dde4); border-radius:12px; color:var(--text-muted, #667085); }
    .beds-empty strong { font-size:13px; color:var(--text, #111827); }
    .beds-empty span { font-size:12px; }
    .beds-empty-icon { display:flex; align-items:center; justify-content:center; width:42px; height:42px; margin-bottom:3px; border-radius:50%; background:#f3f4f6; }
    @media (max-width: 760px) {
      .beds-view-head, .beds-room-head { align-items:flex-start; flex-direction:column; }
      .beds-room-occupancy { width:100%; max-width:none; }
      .beds-chip { min-width:118px; flex:1 1 118px; }
    }
  `],
})
export class CrudResourceComponent implements OnInit, OnDestroy {
  @Input() set resource(v: string) {
    this.resourceKey = v || this.route.snapshot.paramMap.get('resource') || '';
    this.config = resolveResource(this.resourceKey);
    // Reset all view state so switching between resources starts clean.
    this.search = '';
    this.searchText = '';
    this.page = 1;
    this.rows = [];
    this.total = 0;
    this.showForm = false;
    this.openMenuId = null;
    this.fieldErrors = {};
    this.refOptions = {};
    this.refNames = {};
    this.refSearch = {};
    this.refSelectedLabel = {};
    this.refOpenKey = null;
    this.calculatePermissions();
    this.load();
  }

  resourceKey = '';
  config: ResourceConfig | null = null;
  rows: Row[] = [];
  total = 0;
  page = 1;
  pageSize = 10;
  search = '';
  searchText = '';
  showForm = false;
  editingId: number | null = null;
  formTitle = 'Create';
  formValues: Record<string, unknown> = {};
  saving = false;
  loading = false;
  fieldErrors: Record<string, string> = {};
  refOptions: Record<string, Array<{ value: unknown; label: string }> | undefined> = {};
  refSearch: Record<string, string> = {};
  refSelectedLabel: Record<string, string> = {};
  refOpenKey: string | null = null;
  openMenuId: number | null = null;
  menuPos: { top: number; right: number } | null = null;
  confirm: Row | null = null;
  canCreate = false;
  canEdit = false;
  canDelete = false;
  canExport = false;
  studentStatus: 'active' | 'inactive' = 'active';
  statusConfirm: { row: Row; action: 'activate' | 'deactivate' } | null = null;
  leaveConfirm: { row: Row; action: string } | null = null;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();
  private saveBusy = false;
  private refLoadVersion = 0;

  constructor(
    public readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {}

  ngOnInit(): void {
    this.calculatePermissions();
    this.search$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.search = q;
        this.page = 1;
        this.load();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private calculatePermissions(): void {
    const base = PERMISSION_BY_RESOURCE[this.resourceKey] ?? this.resourceKey;
    this.canCreate = this.perms.hasPermission(`${base}:create`);
    this.canEdit = this.perms.hasPermission(`${base}:update`);
    this.canDelete = this.perms.hasPermission(`${base}:delete`);
    this.canExport = this.perms.hasPermission('reports:export') && !NO_EXPORT.has(this.resourceKey);
    if (this.resourceKey === 'beds') this.loadBedHostelOptions();
  }

  get searchPlaceholder(): string {
    if (this.resourceKey === 'rooms') return 'Search room, floor or hostel…';
    if (this.resourceKey === 'beds') return 'Search bed, room or hostel…';
    return `Search ${this.config?.label.toLowerCase() ?? 'records'}…`;
  }

  get bedGroups(): Array<{ key: string; hostelName: string; roomNo: string; occupied: number; total: number; rows: Row[] }> {
    const groups = new Map<string, { key: string; hostelName: string; roomNo: string; occupied: number; total: number; rows: Row[] }>();
    for (const row of this.rows) {
      const key = `${row.hostelId ?? row.hostelName ?? ''}:${row.roomId ?? row.roomNo ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, hostelName: row.hostelName || 'Unknown hostel', roomNo: row.roomNo || '—', occupied: 0, total: 0, rows: [] };
        groups.set(key, group);
      }
      group.rows.push(row);
      group.total += 1;
      if (row.status === 'occupied') group.occupied += 1;
    }
    return Array.from(groups.values());
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.search$.next(this.searchText);
  }

  clearSearch(): void {
    this.searchText = '';
    this.search$.next('');
  }

  trackRow(index: number, row: Row): number | string {
    return row.id ?? index;
  }

  // Beds hostel filter
  bedHostelFilter = '';
  bedHostelOptions: Array<{ id: number; name: string }> = [];

  onBedHostelFilter(): void {
    const params: Record<string, unknown> = { page: 1, limit: this.pageSize };
    if (this.bedHostelFilter) params['filter[hostelId]'] = this.bedHostelFilter;
    this.loading = true;
    const api = this.config?.api;
    if (!api) return;
    this.api.get<Row[]>(api, params).subscribe({
      next: (res) => {
        this.rows = (res?.data as Row[]) ?? [];
        this.total = res?.meta?.total ?? this.rows.length;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  private loadBedHostelOptions(): void {
    this.api.get<Array<{ id: number; name: string; isActive: boolean }>>('/hostels', { limit: 100 }).subscribe({
      next: (r) => { this.bedHostelOptions = (r?.data ?? []).filter(h => h.isActive); },
      error: () => {},
    });
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    // Reset to page 1 so the user doesn't land on an empty page (e.g. page 5 of 10/page → page 5 of 1/page).
    this.page = 1;
    this.load();
  }

  setPage(p: number): void {
    this.page = p;
    this.load();
  }

  get hasActions(): boolean {
    if (this.resourceKey === 'students') return this.rowEditable || this.canDelete;
    return this.rowEditable || this.rowDeletable;
  }

  setStudentStatus(status: 'active' | 'inactive'): void {
    if (this.resourceKey !== 'students' || this.studentStatus === status) return;
    this.studentStatus = status;
    this.page = 1;
    this.openMenuId = null;
    this.load();
  }

  askStatusChange(row: Row, action: 'activate' | 'deactivate'): void {
    this.statusConfirm = { row, action };
  }

  doStatusChange(): void {
    const pending = this.statusConfirm;
    if (!pending || pending.row.id === undefined) return;
    const id = pending.row.id;
    const request = pending.action === 'activate'
      ? this.api.patch(`/students/${id}/reactivate`, {})
      : this.api.delete(`/students/${id}`);
    request.subscribe({
      next: () => {
        this.statusConfirm = null;
        this.toasts.success(pending.action === 'activate' ? 'Student activated' : 'Student deactivated');
        this.load();
      },
      error: () => { this.statusConfirm = null; },
    });
  }

  leaveAction(row: Row, action: string): void {
    const labels: Record<string, string> = { approved: 'Approve', rejected: 'Reject', cancelled: 'Cancel' };
    this.leaveConfirm = { row, action };
  }

  doLeaveAction(): void {
    const pending = this.leaveConfirm;
    if (!pending || pending.row.id === undefined) return;
    const id = pending.row.id;
    this.api.put(`/leaves/${id}`, { status: pending.action }).subscribe({
      next: () => {
        this.leaveConfirm = null;
        this.toasts.success(`Leave ${pending.action}`);
        this.load();
      },
      error: (err) => {
        this.leaveConfirm = null;
        this.toasts.error(err?.error?.message || `Could not ${pending.action} leave`);
      },
    });
  }

  get canUpload(): boolean {
    return this.perms.hasPermission('media:create');
  }

  onUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('files', file);
    this.api.upload('/media/upload', fd).subscribe({
      next: () => {
        this.toasts.success('File uploaded');
        this.load();
      },
      error: () => {},
    });
    input.value = '';
  }

  get formFields(): FieldConfig[] {
    const fields = this.config?.fields ?? [];
    if (this.resourceKey !== "leaves") return fields;

    const isApprover = this.canApproveLeaves;
    const isRequester = this.perms.isRole("student", "teacher", "parent", "staff", "librarian", "hostel_warden", "transport_manager", "receptionist", "accountant");

    if (isApprover) {
      // Approvers editing a leave: show adminComment + status, hide status on create
      if (!this.editingId) {
        return fields.filter(f => f.key !== "status" && f.key !== "adminComment");
      }
      // On edit: show only adminComment + status (approve/reject)
      return fields.filter(f => f.key === "adminComment" || f.key === "status");
    }

    if (isRequester) {
      // Requesters: can submit leave (all fields except status/adminComment)
      // On edit: can only change dates/reason, cancel via menu
      if (!this.editingId) {
        return fields.filter(f => f.key !== "status" && f.key !== "adminComment" && f.key !== "processedBy");
      }
      return fields.filter(f => ["startDate", "endDate", "leaveType", "reason"].includes(f.key));
    }

    return fields;
  }

  get canApproveLeaves(): boolean {
    return this.perms.hasPermission('leaves:approve') || this.perms.isRole('super_admin', 'admin', 'principal');
  }

  get rowEditable(): boolean {
    // Edit is allowed when the user has the update permission, regardless of canCreate.
    // canCreate only controls the "Add new" button — some resources (e.g. beds) are auto-provisioned
    // but still need to be editable (e.g. set to maintenance).
    return this.canEdit;
  }

  get rowDeletable(): boolean {
    // Delete is allowed when the user has the delete permission, regardless of canCreate.
    return this.canDelete;
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize);
  }

  load(): void {
    if (!this.config) return;
    const api = this.resourceKey === 'students' && this.studentStatus === 'inactive'
      ? '/students/inactive'
      : this.config.api;
    this.api
      .get<Row[]>(api, { page: this.page, limit: this.pageSize, q: this.search })
      .subscribe({
        next: (res) => {
          this.rows = (res?.data as Row[]) ?? [];
          this.total = res?.meta?.total ?? this.rows.length;
          this.resolveRefNames();
        },
        error: () => {},
      });
  }

  /** column key -> (id -> readable name) for foreign-key columns, so tables show names not ids. */
  refNames: Record<string, Record<string, string>> = {};

  private resolveRefNames(): void {
    const cfg = this.config;
    if (!cfg) return;
    const version = this.resourceKey;
    for (const col of cfg.columns) {
      const field = cfg.fields.find((f) => f.key === col.key && f.type === 'ref' && f.ref);
      if (!field?.ref) continue;
      const known = this.refNames[col.key] ?? {};
      const ids = Array.from(new Set(this.rows.map((r) => r[col.key]).filter((v) => v != null && v !== '').map(String)))
        .filter((id) => !(id in known))
        .slice(0, 200);
      if (!ids.length) continue;
      const { api, labelKey, secondaryKey } = field.ref;
      this.api.get<Record<string, unknown>[]>(api, { ids: ids.join(','), limit: 200 }).subscribe({
        next: (res) => {
          if (version !== this.resourceKey) return;
          const map = { ...(this.refNames[col.key] ?? {}) };
          for (const r of (res?.data as Record<string, unknown>[]) ?? []) {
            map[String(r['id'])] =
              [r[labelKey], secondaryKey ? r[secondaryKey] : null].filter(Boolean).join(' — ') || `#${r['id']}`;
          }
          this.refNames = { ...this.refNames, [col.key]: map };
        },
        error: () => {},
      });
    }
  }

  cell(col: { key: string; badgeMap?: Record<string, string> }, row: Row): string {
    const raw = row[col.key];
    const name = raw != null ? this.refNames[col.key]?.[String(raw)] : undefined;
    return name ?? this.display(col, raw);
  }

  openCreate(): void {
    this.editingId = null;
    this.formValues = {};
    // A newly admitted student must start in the Active list.
    if (this.resourceKey === 'students') this.formValues['isActive'] = true;
    this.fieldErrors = {};
    this.refOptions = {};
    this.refSearch = {};
    this.refSelectedLabel = {};
    this.refOpenKey = null;
    this.formTitle = `New ${this.config?.label.replace(/s$/, '')}`;
    this.showForm = true;
  }

  openEdit(row: Row): void {
    this.editingId = row.id as number ?? null;
    this.formValues = { ...row };
    this.fieldErrors = {};
    this.refOptions = {};
    this.refSearch = {};
    this.refSelectedLabel = {};
    this.refOpenKey = null;
    this.formTitle = `Edit ${this.config?.label.replace(/s$/, '')}`;
    this.showForm = true;
    // Resolve labels for the already-set reference ids.
    for (const field of this.config?.fields ?? []) {
      if (field.type === 'ref') this.loadRefOptions(field, '');
    }
  }

  toggleRowMenu(id: number | undefined, event: Event): void {
    event.stopPropagation();
    if (id === undefined) return;
    if (this.openMenuId === id) {
      this.openMenuId = null;
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
    this.openMenuId = id;
  }

  @HostListener('document:click')
  closeRowMenu(): void {
    this.openMenuId = null;
  }

  private loadRefOptions(field: FieldConfig, q = ''): void {
    if (!field.ref) return;
    const loadVersion = ++this.refLoadVersion;
    const { api, labelKey, secondaryKey } = field.ref;
    const params: Record<string, unknown> = { page: 1, limit: 100, q };

    // Student sections are dependent on the selected class. The generic
    // reference loader used to fetch the first sections across every class,
    // which caused values such as A, B, C, A, B to appear in the dropdown.
    if (this.resourceKey === 'students' && field.key === 'currentSectionId') {
      const classId = this.formValues['currentClassId'];
      if (classId === null || classId === undefined || classId === '') {
        this.refOptions[field.key] = [];
        return;
      }
      params['filter[classId]'] = classId;
    }

    // Hostel allocation is a strict cascade: Hostel -> Room -> Bed.
    // This prevents selecting a room/bed from another hostel by accident.
    if (this.resourceKey === 'hostel-allocations' && field.key === 'roomId') {
      const hostelId = this.formValues['hostelId'];
      if (hostelId === null || hostelId === undefined || hostelId === '') {
        this.refOptions[field.key] = [];
        return;
      }
      params['filter[hostelId]'] = hostelId;
    }
    if (this.resourceKey === 'hostel-allocations' && field.key === 'bedId') {
      const roomId = this.formValues['roomId'];
      if (roomId === null || roomId === undefined || roomId === '') {
        this.refOptions[field.key] = [];
        return;
      }
      params['filter[roomId]'] = roomId;
      // On create only available beds are selectable. While editing an
      // allocation, also load the current bed so an existing allocation can
      // be edited without its occupied bed disappearing from the dropdown.
      if (!this.editingId) params['filter[status]'] = 'available';
    }

    // Apply refFilter if declared (e.g. only show hostel_warden employees in the warden dropdown).
    if (field.refFilter) {
      params[`filter[${field.refFilter.field}]`] = field.refFilter.value;
    }

    this.api.get<Record<string, unknown>[]>(api, params).subscribe({
      next: (res) => {
        if (loadVersion !== this.refLoadVersion) return;
        let rows = (res?.data as Record<string, unknown>[]) ?? [];

        // Defense in depth: the API filter is authoritative for the query, but
        // the allocation UI must never show a room/bed from a stale response.
        // Filter the returned objects again using their actual parent ids.
        if (this.resourceKey === 'hostel-allocations' && field.key === 'roomId') {
          const hostelId = String(this.formValues['hostelId'] ?? '');
          rows = rows.filter((r) => String(r['hostelId'] ?? '') === hostelId);
        }
        if (this.resourceKey === 'hostel-allocations' && field.key === 'bedId') {
          const roomId = String(this.formValues['roomId'] ?? '');
          rows = rows.filter((r) => String(r['roomId'] ?? '') === roomId);
          if (this.editingId) {
            const currentBedId = String(this.formValues['bedId'] ?? '');
            rows = rows.filter((r) => String(r['status'] ?? '') === 'available' || String(r['id']) === currentBedId);
          }
        }

        const seen = new Set<string>();
        const opts = rows
          .map((r) => ({
            value: r['id'],
            label:
              [r[labelKey], secondaryKey ? r[secondaryKey] : null].filter(Boolean).join(' — ') ||
              `#${r['id']}`,
          }))
          .filter((opt) => {
            const key = String(opt.value);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        this.refOptions[field.key] = opts;
        const current = this.formValues[field.key];
        const match = opts.find((o) => String(o.value) === String(current));
        if (match && !this.refSearch[field.key]) this.refSelectedLabel[field.key] = match.label;
      },
      error: () => {},
    });
  }

  openRef(field: FieldConfig): void {
    this.refOpenKey = field.key;
    this.loadRefOptions(field, this.refSearch[field.key] ?? '');
  }

  onRefBlur(key: string): void {
    // Let a mousedown selection register before closing.
    setTimeout(() => {
      if (this.refOpenKey === key) {
        // Typed text without picking a suggestion must not look "selected".
        if (this.formValues[key] === null || this.formValues[key] === undefined) {
          this.refSelectedLabel[key] = '';
          this.refSearch[key] = '';
        }
        this.refOpenKey = null;
      }
    }, 150);
  }

  onRefInput(field: FieldConfig, event: Event): void {
    const q = (event.target as HTMLInputElement).value;
    this.refSearch[field.key] = q;
    this.refSelectedLabel[field.key] = q;
    this.formValues[field.key] = null;
    this.refOpenKey = field.key;
    this.loadRefOptions(field, q);
  }

  selectRef(key: string, opt: { value: unknown; label: string }): void {
    this.formValues[key] = opt.value;
    this.refSelectedLabel[key] = opt.label;
    this.refSearch[key] = '';
    this.refOpenKey = null;

    // Changing a student's class invalidates the previously selected section.
    // Reload the section list using the newly selected class.
    if (this.resourceKey === 'students' && key === 'currentClassId') {
      this.formValues['currentSectionId'] = null;
      this.refSelectedLabel['currentSectionId'] = '';
      this.refSearch['currentSectionId'] = '';
      this.refOptions['currentSectionId'] = [];
    }

    if (this.resourceKey === 'hostel-allocations' && key === 'hostelId') {
      ++this.refLoadVersion;
      this.formValues['roomId'] = null;
      this.formValues['bedId'] = null;
      this.refSelectedLabel['roomId'] = '';
      this.refSelectedLabel['bedId'] = '';
      this.refSearch['roomId'] = '';
      this.refSearch['bedId'] = '';
      this.refOptions['roomId'] = [];
      this.refOptions['bedId'] = [];
    }

    if (this.resourceKey === 'hostel-allocations' && key === 'roomId') {
      ++this.refLoadVersion;
      this.formValues['bedId'] = null;
      this.refSelectedLabel['bedId'] = '';
      this.refSearch['bedId'] = '';
      this.refOptions['bedId'] = [];
    }
  }

  refLabel(key: string): string {
    return this.refSelectedLabel[key] ?? '';
  }

  closeForm(): void {
    this.showForm = false;
  }

  clearFieldErrors(): void {
    if (Object.keys(this.fieldErrors).length) this.fieldErrors = {};
  }

  save(): void {
    if (!this.config || this.saveBusy) return;

    this.fieldErrors = {};
    for (const f of this.config.fields) {
      if (!f.required) continue;
      const v = this.formValues[f.key];
      if (v === '' || v === null || v === undefined) {
        this.fieldErrors[f.key] = `${f.label} is required`;
      }
    }
    if (Object.keys(this.fieldErrors).length) return;

    this.saveBusy = true;
    this.saving = true;
    const body: Record<string, unknown> = {};
    for (const f of this.config.fields) {
      // Hostel allocation room/hostel are UI cascade values. The backend
      // derives both from the selected bed, so do not send stale parent ids
      // that can conflict with the bed selected by the user.
      if (
        this.resourceKey === 'hostel-allocations' &&
        (f.key === 'hostelId' || f.key === 'roomId')
      ) {
        continue;
      }
      let v = this.formValues[f.key];
      if (v === '' || v === null || v === undefined) v = this.formDefault(f);
      if (v !== undefined) {
        // Convert comma-separated recipient IDs into a number[] for the backend.
        if (f.key === 'recipientIds' && typeof v === 'string') {
          const ids = v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
          body[f.key] = ids;
        } else {
          body[f.key] = v;
        }
      }
    }
    const request = this.editingId
      ? this.api.put(`${this.config.api}/${this.editingId}`, body)
      : this.api.post(this.config.api, body);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.saveBusy = false;
        this.showForm = false;
        this.toasts.success(this.editingId ? 'Record updated' : 'Record created');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.saveBusy = false;
        // Map backend field-level errors ({ errors: [{ path, message }] }) to inline red messages
        // so the user sees exactly which field failed — instead of only a generic toast.
        const errs = err?.error?.errors;
        if (Array.isArray(errs)) {
          for (const e of errs) {
            if (e?.path) this.fieldErrors[e.path] = e.message ?? 'Invalid value';
          }
        }
      },
    });
  }

  private formDefault(f: FieldConfig): unknown {
    if (f.type === 'bool') return false;
    if (f.type === 'number') return undefined;
    return undefined;
  }

  askDelete(row: Row): void {
    this.confirm = row;
  }

  doDelete(): void {
    const id = this.confirm?.id;
    if (!this.config || id === undefined) return;
    this.api.delete(`${this.config.api}/${id}`).subscribe({
      next: () => {
        this.confirm = null;
        this.toasts.success('Record deleted');
        this.load();
      },
      error: () => {
        this.confirm = null;
      },
    });
  }

  exportCsv(): void {
    const api = this.config?.api;
    if (!api) return;
    this.api.download(`${api}/export`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.resourceKey}-${new Date().toLocaleDateString('en-CA')}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      error: () => this.toasts.error('Export failed'),
    });
    // Note: the api.download method doesn't expose response headers, so we can't check
      // X-Export-Truncated here. The backend sets it, but the frontend blob download
      // doesn't give access to headers. A future improvement would be to use a
      // full HttpResponse and check headers.
  }

  bedStatusClass(value: unknown): string {
    const status = String(value ?? '');
    if (status === 'available') return 'success';
    if (status === 'occupied') return 'danger';
    if (status === 'maintenance') return 'warning';
    return '';
  }

  bedStatusLabel(value: unknown): string {
    const status = String(value ?? '');
    if (!status) return '—';
    return status.replace(/_/g, ' ');
  }

  badgeClass(col: { badgeMap?: Record<string, string> }, value: unknown): string {
    const key = String(value ?? '');
    return col.badgeMap?.[key] ?? '';
  }

  isArray(v: unknown): boolean { return Array.isArray(v); }

  display(col: { key: string; badgeMap?: Record<string, string> }, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    const s = String(value);
    if (col.badgeMap) return col.badgeMap[s] ? s.replace(/_/g, ' ') : s.replace(/_/g, ' ');
    return s.replace(/_/g, ' ');
  }

  money(value: unknown): string {
    const n = Number(value ?? 0);
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: this.currency() }).format(n);
    } catch {
      return String(n);
    }
  }

  private currency(): string {
    return currencyCode();
  }
}