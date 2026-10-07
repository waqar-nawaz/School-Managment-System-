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
          @if (config.canCreate !== false && canCreate && !(resourceKey === 'leaves' && canApproveLeaves)) {
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
          @if (resourceKey === 'leaves') {
            <select class="form-control leave-status-filter" [(ngModel)]="leaveStatusFilter" (ngModelChange)="onLeaveStatusFilter()" aria-label="Filter leave requests by status">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          }
          @if (resourceKey === 'book-issues') {
            <select class="form-control" style="max-width:160px;margin-right:12px" [(ngModel)]="bookIssueStatusFilter" (ngModelChange)="onBookIssueStatusFilter()">
              <option value="">All statuses</option>
              <option value="issued">Issued</option>
              <option value="overdue">Overdue</option>
              <option value="returned">Returned</option>
              <option value="lost">Lost</option>
            </select>
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
                              @if (resourceKey === 'students') {
                                @if (rowEditable) { <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit</button> }
                                @if (row['isActive'] && canDelete) { <button type="button" class="row-menu-item danger" (click)="askStatusChange(row, 'deactivate'); openMenuId = null"><app-icon name="x" [size]="15" /> Deactivate</button> }
                                @if (!row['isActive'] && canEdit) { <button type="button" class="row-menu-item" (click)="askStatusChange(row, 'activate'); openMenuId = null"><app-icon name="check" [size]="15" /> Activate</button> }
                              } @else if (resourceKey === 'book-issues') {
                                @if (['issued', 'overdue'].includes(row['status'])) {
                                  <button type="button" class="row-menu-item" (click)="openLibraryAction(row, 'return'); openMenuId = null"><app-icon name="check" [size]="15" /> Return book</button>
                                  <button type="button" class="row-menu-item danger" (click)="openLibraryAction(row, 'lost'); openMenuId = null"><app-icon name="x" [size]="15" /> Mark lost</button>
                                  @if (rowEditable) { <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit due date</button> }
                                }
                              } @else if (resourceKey === 'notifications') {
                                @if (!row['readAt']) {
                                  <button type="button" class="row-menu-item" (click)="markNotificationRead(row); openMenuId = null"><app-icon name="check" [size]="15" /> Mark as read</button>
                                } @else {
                                  <span class="notification-read-state"><app-icon name="check" [size]="14" /> Read</span>
                                }
                              } @else if (resourceKey === 'leaves') {
                                <button type="button" class="row-menu-item" (click)="openView(row); openMenuId = null"><app-icon name="eye" [size]="15" /> View details</button>
                                @if (row['status'] === 'pending') {
                                  @if (canApproveLeaves) {
                                    <button type="button" class="row-menu-item" (click)="leaveAction(row, 'approved'); openMenuId = null"><app-icon name="check" [size]="15" /> Approve</button>
                                    <button type="button" class="row-menu-item danger" (click)="leaveAction(row, 'rejected'); openMenuId = null"><app-icon name="x" [size]="15" /> Reject</button>
                                  } @else {
                                    <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit request</button>
                                    <button type="button" class="row-menu-item danger" (click)="leaveAction(row, 'cancelled'); openMenuId = null"><app-icon name="x" [size]="15" /> Cancel request</button>
                                  }
                                }
                              } @else {
                                @if (rowEditable) { <button type="button" class="row-menu-item" (click)="openEdit(row); openMenuId = null"><app-icon name="edit" [size]="15" /> Edit</button> }
                                @if (rowDeletable) { <button type="button" class="row-menu-item danger" (click)="askDelete(row); openMenuId = null"><app-icon name="trash" [size]="15" /> Delete</button> }
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

    @if (showForm && config && !(resourceKey === 'leaves' && formReadOnly)) {
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
                  @if (formReadOnly) {
                    <label class="form-label-static">{{ field.label }}</label>
                    <div class="form-read-value" [class.form-read-value-badge]="field.type === 'select'">
                      @switch (field.type) {
                        @case ('bool') {
                          @if (formValues[field.key]) { <span class="badge badge-success">Yes</span> }
                          @else { <span class="badge">No</span> }
                        }
                        @case ('select') {
                          @if (field.key === 'status' && formValues[field.key]) {
                            <span class="badge badge-{{ leaveStatusBadgeClass(formValues[field.key]) }}">{{ displayFieldValue(field) }}</span>
                          } @else {
                            <span>{{ displayFieldValue(field) }}</span>
                          }
                        }
                        @default {
                          <span>{{ displayFieldValue(field) }}</span>
                        }
                      }
                    </div>
                  } @else {
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
                  }
                  @if (fieldErrors[field.key]) {
                    <div class="field-error">{{ fieldErrors[field.key] }}</div>
                  } @else if (field.hint && !formReadOnly) {
                    <small class="form-hint">{{ field.hint }}</small>
                  }
                </div>
              }
            </div>
            @if (config.fields.length === 0) {
              <p class="form-hint">This module is read-only.</p>
            }
            @if (formReadOnly) {
              <div class="form-read-note">
                <app-icon name="eye" [size]="14" />
                <span>This leave request has been processed and can no longer be edited.</span>
              </div>
            }
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="closeForm()"><app-icon name="x" [size]="14" /> {{ formReadOnly ? 'Close' : 'Cancel' }}</button>
              @if (!formReadOnly) {
                <button type="submit" class="btn btn-primary" [disabled]="saving">
                  <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save' }}
                </button>
              }
            </div>
          </form>
        </div>
      </div>
    }

    @if (showForm && config && resourceKey === 'leaves' && formReadOnly) {
      <div class="modal-backdrop leave-view-backdrop">
        <div class="modal leave-view-modal" role="dialog" aria-modal="true" aria-labelledby="leave-view-title">
          <div class="leave-view-head">
            <div class="leave-view-person">
              <div class="leave-avatar">{{ leaveInitials }}</div>
              <div>
                <div class="leave-view-eyebrow">Leave request #{{ editingId }}</div>
                <h2 id="leave-view-title">{{ leaveEmployeeName }}</h2>
                <div class="leave-view-role">{{ leaveUserRole || 'Employee' }}</div>
              </div>
            </div>
            <div class="leave-view-head-actions">
              <span class="badge badge-{{ leaveStatusBadgeClass(formValues['status']) }}">{{ leaveStatusLabel }}</span>
              <button type="button" class="modal-close" (click)="closeForm()" aria-label="Close">
                <app-icon name="x" [size]="16" />
              </button>
            </div>
          </div>

          <div class="leave-view-body">
            <div class="leave-summary-grid">
              <div class="leave-summary-item">
                <span class="leave-summary-label">Leave type</span>
                <strong>{{ leaveTypeLabel }}</strong>
              </div>
              <div class="leave-summary-item">
                <span class="leave-summary-label">Duration</span>
                <strong>{{ leaveDurationLabel }}</strong>
              </div>
              <div class="leave-summary-item">
                <span class="leave-summary-label">Start date</span>
                <strong>{{ leaveDate(formValues['startDate']) }}</strong>
              </div>
              <div class="leave-summary-item">
                <span class="leave-summary-label">End date</span>
                <strong>{{ leaveDate(formValues['endDate']) }}</strong>
              </div>
            </div>

            <div class="leave-detail-section">
              <div class="leave-section-title">Request details</div>
              <div class="leave-detail-card">
                <div class="leave-detail-row">
                  <span>Reason</span>
                  <p>{{ formValues['reason'] || 'No reason provided.' }}</p>
                </div>
              </div>
            </div>

            @if (formValues['processedBy'] || formValues['processedByUserName'] || formValues['adminComment']) {
              <div class="leave-detail-section">
                <div class="leave-section-title">Review</div>
                <div class="leave-review-card">
                  <div class="leave-review-top">
                    <div class="leave-review-icon"><app-icon name="check" [size]="16" /></div>
                    <div>
                      <strong>{{ formValues['processedByUserName'] || 'Processed by administrator' }}</strong>
                      <span>{{ formValues['status'] === 'rejected' ? 'Rejection reason' : 'Administrator note' }}</span>
                    </div>
                  </div>
                  @if (formValues['adminComment']) {
                    <p>{{ formValues['adminComment'] }}</p>
                  } @else {
                    <p class="muted">No administrator note was added.</p>
                  }
                </div>
              </div>
            }
          </div>

          <div class="modal-actions leave-view-actions">
            <button type="button" class="btn btn-ghost" (click)="closeForm()">
              <app-icon name="x" [size]="14" /> Close
            </button>
            @if (formValues['status'] === 'pending') {
              @if (canApproveLeaves) {
                <button type="button" class="btn btn-danger" (click)="closeForm(); leaveAction(formValues, 'rejected')">
                  <app-icon name="x" [size]="14" /> Reject
                </button>
                <button type="button" class="btn btn-primary" (click)="closeForm(); leaveAction(formValues, 'approved')">
                  <app-icon name="check" [size]="14" /> Approve
                </button>
              } @else {
                <button type="button" class="btn btn-primary" (click)="closeForm(); openEdit(formValues)">
                  <app-icon name="edit" [size]="14" /> Edit request
                </button>
              }
            }
          </div>
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

    @if (leaveComment) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">{{ leaveComment.action === 'approved' ? 'Approve leave' : 'Reject leave' }}</div>
            <button type="button" class="modal-close" (click)="leaveComment = null" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <p class="leave-comment-intro">{{ leaveComment.action === 'approved'
            ? 'Optionally add a note for the requester (visible to them in their list).'
            : 'Add a reason for rejecting this leave — the requester will see it.' }}</p>
          <textarea
            class="form-control leave-comment-text"
            name="leaveComment"
            [(ngModel)]="leaveComment.comment"
            rows="4"
            [placeholder]="leaveComment.action === 'approved' ? 'e.g. Approved — enjoy your time off.' : 'e.g. Leave conflicts with mid-term exams; please reschedule.'"></textarea>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="leaveComment = null"><app-icon name="x" [size]="14" /> Cancel</button>
            <button
              type="button"
              [class]="leaveComment.action === 'rejected' ? 'btn btn-danger' : 'btn btn-primary'"
              (click)="doLeaveAction()"
              [disabled]="leaveComment.action === 'rejected' && !(leaveComment.comment || '').trim()">
              <app-icon name="check" [size]="14" /> {{ leaveComment.action === 'approved' ? 'Approve' : 'Reject' }}
            </button>
          </div>
          @if (leaveComment.action === 'rejected' && !(leaveComment.comment || '').trim()) {
            <small class="form-hint leave-comment-hint">A reason is required when rejecting a leave request.</small>
          }
        </div>
      </div>
    }
    @if (libraryAction) {
      <div class="modal-backdrop">
        <div class="modal library-action-modal">
          <div class="modal-head">
            <div>
              <div class="modal-title">{{ libraryAction.type === 'return' ? 'Return book' : 'Mark book as lost' }}</div>
              <div class="modal-subtitle">{{ libraryAction.row.bookTitle || 'Book' }} · {{ libraryAction.row.accessionNo || 'Copy' }} · {{ libraryAction.row.borrowerName || 'Borrower' }}</div>
            </div>
            <button type="button" class="modal-close" (click)="closeLibraryAction()" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <div class="library-action-body">
            @if (libraryAction.type === 'return') {
              <label class="form-group">
                <span>Fine per late day</span>
                <input type="number" class="form-control" min="0" step="0.01" [(ngModel)]="libraryActionAmount" />
                <small class="form-hint">Leave the default unless your library uses a different rate for this return. No fine is created when the book is not late.</small>
              </label>
            } @else {
              <label class="form-group">
                <span>Lost-book charge</span>
                <input type="number" class="form-control" min="0" step="0.01" [(ngModel)]="libraryActionAmount" />
                <small class="form-hint">This is added to the book value when the copy is marked lost.</small>
              </label>
            }
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="closeLibraryAction()">Cancel</button>
            <button type="button" class="btn" [class.btn-danger]="libraryAction.type === 'lost'" [class.btn-primary]="libraryAction.type === 'return'" [disabled]="libraryActionSaving" (click)="doLibraryAction()">
              <app-icon name="check" [size]="14" /> {{ libraryActionSaving ? 'Saving…' : (libraryAction.type === 'return' ? 'Return book' : 'Mark lost') }}
            </button>
          </div>
        </div>
      </div>
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
    .library-action-modal { max-width:520px; }
    .library-action-modal .modal-subtitle { margin-top:4px; font-size:12px; color:var(--text-muted); }
    .library-action-body { padding:20px 24px 4px; }
    .library-action-body .form-group { display:flex; flex-direction:column; gap:7px; }
    .library-action-body .form-group > span { font-size:13px; font-weight:600; color:var(--text); }
    .library-action-body .form-control { width:100%; }
    .library-action-body .form-hint { line-height:1.45; }
    .beds-view { padding: 4px 0 2px; }
    .beds-view-head { display:flex; align-items:center; justify-content:space-between; gap:18px; margin:0 0 16px; }
    .beds-view-title { font-size:15px; font-weight:700; letter-spacing:-.01em; }
    .beds-view-subtitle { margin-top:3px; font-size:12px; color:var(--text-muted); }
    .beds-view-legend { display:flex; flex-wrap:wrap; gap:12px; font-size:12px; color:var(--text-muted, #667085); }
    .beds-view-legend span { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
    .beds-dot, .beds-chip-status { width:7px; height:7px; border-radius:50%; display:inline-block; flex:0 0 auto; }
    .beds-dot.available, .beds-chip-success .beds-chip-status { background:#16a34a; }
    .beds-dot.occupied, .beds-chip-danger .beds-chip-status { background:#dc2626; }
    .beds-dot.maintenance, .beds-chip-warning .beds-chip-status { background:#d97706; }
    .beds-room-list { display:grid; gap:12px; }
    .beds-room-card { border:1px solid var(--border); border-radius:12px; background:var(--surface); overflow:visible; }
    .beds-room-head { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:14px 16px 12px; border-bottom:1px solid var(--border); }
    .beds-room-location { min-width:180px; }
    .beds-hostel-name { font-size:13px; font-weight:700; color:var(--text); }
    .beds-room-name { margin-top:3px; font-size:12px; color:var(--text-muted, #667085); }
    .beds-room-occupancy { width:190px; max-width:35%; }
    .beds-occupancy-label { display:flex; justify-content:space-between; gap:8px; margin-bottom:6px; font-size:11px; color:var(--text-muted, #667085); }
    .beds-progress { height:5px; overflow:hidden; border-radius:999px; background:var(--neutral-300); }
    .beds-progress span { display:block; height:100%; border-radius:inherit; background:var(--primary); transition:width .2s ease; }
    .beds-room-body { padding:14px 16px 16px; }
    .beds-chip-list { display:flex; flex-wrap:wrap; gap:9px; }
    .beds-chip { position:relative; min-width:128px; display:flex; align-items:center; gap:9px; padding:9px 8px 9px 11px; border:1px solid var(--border); border-radius:9px; background:var(--neutral-50); color:var(--text); }
    .beds-chip-success { border-color:rgba(34,197,94,.38); background:rgba(34,197,94,.10); }
    .beds-chip-danger { border-color:rgba(239,68,68,.38); background:rgba(239,68,68,.10); }
    .beds-chip-warning { border-color:rgba(245,158,11,.38); background:rgba(245,158,11,.10); }
    .beds-chip-copy { min-width:0; display:flex; flex-direction:column; gap:2px; }
    .beds-chip-copy strong { font-size:12px; line-height:1.2; color:var(--text); }
    .beds-chip-copy small { font-size:10px; line-height:1.2; text-transform:capitalize; color:var(--text-muted); }
    .beds-chip-menu { margin-left:auto; width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; border:0; border-radius:6px; background:transparent; color:var(--text-muted); cursor:pointer; }
    .beds-chip-menu:hover { background:var(--neutral-100); color:var(--text); }
    .beds-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; min-height:180px; border:1px dashed var(--border); border-radius:12px; color:var(--text-muted); }
    .beds-empty strong { font-size:13px; color:var(--text); }
    .beds-empty span { font-size:12px; }
    .beds-empty-icon { display:flex; align-items:center; justify-content:center; width:42px; height:42px; margin-bottom:3px; border-radius:50%; background:var(--neutral-100); }
    .leave-view-backdrop { align-items: center; }
    .leave-view-modal { width:min(680px, calc(100vw - 32px)); max-width:680px; overflow:hidden; }
    .leave-view-head { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:20px 22px; border-bottom:1px solid var(--border); background:var(--surface); }
    .leave-view-person { display:flex; align-items:center; gap:12px; min-width:0; }
    .leave-avatar { width:44px; height:44px; flex:0 0 44px; display:flex; align-items:center; justify-content:center; border-radius:12px; background:color-mix(in srgb, var(--primary) 14%, var(--surface)); color:var(--primary); font-size:14px; font-weight:800; }
    .leave-view-eyebrow { margin-bottom:2px; font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; }
    .leave-view-person h2 { margin:0; color:var(--text); font-size:18px; line-height:1.25; }
    .leave-view-role { margin-top:3px; color:var(--text-muted); font-size:12px; text-transform:capitalize; }
    .leave-view-head-actions { display:flex; align-items:center; gap:12px; flex:0 0 auto; }
    .leave-view-body { padding:20px 22px 4px; background:var(--surface); max-height:min(62vh, 620px); overflow:auto; }
    .leave-summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
    .leave-summary-item { min-width:0; padding:13px 14px; border:1px solid var(--border); border-radius:10px; background:var(--neutral-50); }
    .leave-summary-label { display:block; margin-bottom:5px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.055em; }
    .leave-summary-item strong { display:block; color:var(--text); font-size:13px; font-weight:700; text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .leave-detail-section { margin-top:20px; }
    .leave-section-title { margin-bottom:8px; font-size:12px; font-weight:800; color:var(--text); text-transform:uppercase; letter-spacing:.055em; }
    .leave-detail-card, .leave-review-card { border:1px solid var(--border); border-radius:10px; background:var(--surface); }
    .leave-detail-row { padding:14px 16px; }
    .leave-detail-row > span { display:block; margin-bottom:6px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; }
    .leave-detail-row p, .leave-review-card p { margin:0; color:var(--text); font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
    .leave-review-card { padding:14px 16px; }
    .leave-review-top { display:flex; align-items:center; gap:10px; }
    .leave-review-icon { width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:9px; background:var(--neutral-100); color:var(--primary); }
    .leave-review-top strong { display:block; color:var(--text); font-size:13px; }
    .leave-review-top span { display:block; margin-top:2px; color:var(--text-muted); font-size:11px; }
    .leave-review-card p { margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }
    .leave-review-card p.muted { color:var(--text-muted); }
    .leave-view-actions { border-top:1px solid var(--border); background:var(--surface); }
    @media (max-width:700px) {
      .leave-view-head { align-items:flex-start; }
      .leave-view-head-actions { gap:7px; }
      .leave-summary-grid { grid-template-columns:repeat(2,1fr); }
    }
    @media (max-width:480px) {
      .leave-view-head { padding:16px; }
      .leave-view-body { padding:16px 16px 4px; }
      .leave-summary-grid { grid-template-columns:1fr 1fr; gap:8px; }
      .leave-summary-item { padding:11px 12px; }
      .leave-view-person h2 { font-size:16px; }
    }
    .leave-comment-intro { color: var(--text-muted, #667085); margin: 0 0 12px; font-size: 13px; line-height: 1.5; }
    .leave-comment-text { width: 100%; min-height: 96px; resize: vertical; }
    .leave-comment-hint { display: block; margin-top: 8px; color: var(--danger, #dc2626); }
    .form-label-static { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted, #667085); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
    .form-read-value { padding: 9px 12px; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; background: var(--neutral-50, #f9fafb); font-size: 14px; color: var(--text, #111827); min-height: 40px; display: flex; align-items: center; word-break: break-word; line-height: 1.45; }
    .form-read-value-badge { background: transparent; border: 0; padding: 0; min-height: 0; }
    .form-read-value textarea { white-space: pre-wrap; }
    .form-read-note { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 10px 14px; border-radius: 8px; background: var(--neutral-50, #f3f4f6); color: var(--text-muted, #667085); font-size: 13px; line-height: 1.4; }
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
    this.leaveStatusFilter = '';
    this.bookIssueStatusFilter = '';
    this.page = 1;
    this.rows = [];
    this.total = 0;
    this.showForm = false;
    this.formReadOnly = false;
    this.leaveConfirm = null;
    this.leaveComment = null;
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
  // Approver-only dialog: collects an optional approve note OR a required reject reason.
  // Approve sends an empty string when none provided; Reject is disabled until a reason is typed.
  leaveComment: { row: Row; action: 'approved' | 'rejected'; comment: string } | null = null;
  // When true, the form modal renders as read-only (no Save button, all inputs disabled).
  // Used by non-approvers viewing a processed leave so they can see the admin's comment.
  formReadOnly = false;

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

  libraryAction: { type: 'return' | 'lost'; row: Row } | null = null;
  libraryActionAmount = 1;
  libraryActionSaving = false;
  bookIssueStatusFilter = '';
  leaveStatusFilter = '';

  openLibraryAction(row: Row, type: 'return' | 'lost'): void {
    this.libraryAction = { row, type };
    this.libraryActionAmount = type === 'return' ? 1 : 10;
    this.libraryActionSaving = false;
  }

  closeLibraryAction(): void {
    if (this.libraryActionSaving) return;
    this.libraryAction = null;
  }

  doLibraryAction(): void {
    const action = this.libraryAction;
    const amount = Number(this.libraryActionAmount);
    if (!action || action.row.id === undefined || !Number.isFinite(amount) || amount < 0) {
      this.toasts.error('Enter a valid non-negative amount');
      return;
    }

    this.libraryActionSaving = true;
    const endpoint = `/book-issues/${action.row.id}/${action.type === 'return' ? 'return' : 'mark-lost'}`;
    const body = action.type === 'return' ? { perDayFine: amount } : { lostFine: amount };

    this.api.post(endpoint, body).subscribe({
      next: () => {
        this.libraryActionSaving = false;
        this.libraryAction = null;
        this.toasts.success(action.type === 'return' ? 'Book returned' : 'Book marked lost');
        this.load();
      },
      error: (err) => {
        this.libraryActionSaving = false;
        this.toasts.error(err?.error?.message || 'Library action failed');
      },
    });
  }

  onLeaveStatusFilter(): void {
    this.page = 1;
    this.load();
  }

  onBookIssueStatusFilter(): void {
    this.page = 1;
    this.load();
  }

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
    if (this.resourceKey === 'notifications') return this.perms.hasPermission('notifications:update');
    return this.rowEditable || this.rowDeletable;
  }

  get canMarkNotificationRead(): boolean {
    return this.resourceKey === 'notifications' && this.perms.hasPermission('notifications:update');
  }

  markNotificationRead(row: Row): void {
    if (!this.canMarkNotificationRead || row.id === undefined || row['readAt']) return;
    this.api.patch(`/notifications/${row.id}/read`, {}).subscribe({
      next: () => {
        this.toasts.success('Notification marked as read');
        this.load();
      },
      error: (err) => this.toasts.error(err?.error?.message || 'Could not mark notification as read'),
    });
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
    // Approvers go through the comment dialog (with optional/required comment).
    // Requesters cancelling their own pending leave get the simple ConfirmDialog instead.
    if (this.canApproveLeaves && (action === 'approved' || action === 'rejected')) {
      this.leaveComment = {
        row,
        action: action as 'approved' | 'rejected',
        comment: '',
      };
      return;
    }
    this.leaveConfirm = { row, action };
  }

  doLeaveAction(): void {
    const approverDialog = this.leaveComment;
    const requesterDialog = this.leaveConfirm;
    if (approverDialog) {
      const id = approverDialog.row.id;
      if (id === undefined) return;
      const payload: Record<string, unknown> = { status: approverDialog.action };
      // Always send the comment (trimmed). The backend stores "" when none is provided.
      // For rejections, the UI prevents submitting without a comment, but we still send
      // the trimmed string here so the backend is the source of truth.
      payload['adminComment'] = (approverDialog.comment || '').trim();
      this.api.put(`/leaves/${id}`, payload).subscribe({
        next: () => {
          this.leaveComment = null;
          this.toasts.success(`Leave ${approverDialog.action}`);
          this.load();
        },
        error: (err) => {
          this.leaveComment = null;
          this.toasts.error(err?.error?.message || `Could not ${approverDialog.action} leave`);
        },
      });
      return;
    }
    if (requesterDialog) {
      const id = requesterDialog.row.id;
      if (id === undefined) return;
      this.api.put(`/leaves/${id}`, { status: requesterDialog.action }).subscribe({
        next: () => {
          this.leaveConfirm = null;
          this.toasts.success(`Leave ${requesterDialog.action}`);
          this.load();
        },
        error: (err) => {
          this.leaveConfirm = null;
          this.toasts.error(err?.error?.message || `Could not ${requesterDialog.action} leave`);
        },
      });
    }
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

    if (this.resourceKey === "book-issues") {
      if (!this.editingId) return fields.filter(f => f.key !== "dueDate");
      return fields.filter(f => !["bookCopyId", "userId", "dueInDays"].includes(f.key));
    }

    if (this.resourceKey !== "leaves") return fields;

    // Read-only view (requester looking at a processed leave): show every field so they can see
    // the dates, reason, admin comment, and status — but every input is disabled.
    if (this.formReadOnly) {
      return fields.filter(f => f.key !== "processedBy");
    }

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
    return this.perms.hasPermission('leaves:approve');
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
      : this.resourceKey === 'book-issues' && this.bookIssueStatusFilter === 'overdue'
        ? '/book-issues/overdue/list'
        : this.config.api;
    const params: Record<string, unknown> = { page: this.page, limit: this.pageSize, q: this.search };
    if (this.resourceKey === 'leaves' && this.leaveStatusFilter) {
      params['filter[status]'] = this.leaveStatusFilter;
    }
    if (this.resourceKey === 'book-issues' && this.bookIssueStatusFilter && this.bookIssueStatusFilter !== 'overdue') {
      params['filter[status]'] = this.bookIssueStatusFilter;
    }
    this.api
      .get<Row[]>(api, params)
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
    this.formReadOnly = false;
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
    if (this.resourceKey === "book-issues" && row.dueDate) {
      const d = new Date(row.dueDate);
      this.formValues["dueDate"] = Number.isNaN(d.getTime()) ? String(row.dueDate).slice(0, 10) : d.toISOString().slice(0, 10);
    }
    this.formReadOnly = false;
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

  /** Read-only view for a processed leave: requester sees the admin's comment,
   *  dates, reason, and approver name — but cannot edit any field. */
  openView(row: Row): void {
    this.editingId = row.id as number ?? null;
    this.formValues = { ...row };
    this.formReadOnly = true;
    this.fieldErrors = {};
    this.refOptions = {};
    this.refSearch = {};
    this.refSelectedLabel = {};
    this.refOpenKey = null;
    this.formTitle = `View ${this.config?.label.replace(/s$/, '')}`;
    this.showForm = true;
  }

  get leaveEmployeeName(): string {
    const direct = String(this.formValues['userName'] ?? '').trim();
    if (direct) return direct;
    const user = this.formValues['user'] as Record<string, unknown> | undefined;
    const first = String(user?.['firstName'] ?? '').trim();
    const last = String(user?.['lastName'] ?? '').trim();
    return [first, last].filter(Boolean).join(' ') || `User #${this.formValues['userId'] ?? '—'}`;
  }

  get leaveUserRole(): string {
    const user = this.formValues['user'] as Record<string, unknown> | undefined;
    return String(this.formValues['userRole'] ?? user?.['role'] ?? '').replace(/_/g, ' ');
  }

  get leaveInitials(): string {
    const parts = this.leaveEmployeeName.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'LR';
  }

  get leaveDurationLabel(): string {
    const days = Number(this.formValues['days'] ?? 0);
    if (!Number.isFinite(days) || days <= 0) return '—';
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  get leaveTypeLabel(): string {
    return String(this.formValues['leaveType'] ?? '—').replace(/_/g, ' ')
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  get leaveStatusLabel(): string {
    return String(this.formValues['status'] ?? '—').replace(/_/g, ' ')
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  leaveDate(value: unknown): string {
    if (!value) return '—';
    const d = new Date(String(value));
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  /** Human-readable value for a form field shown in the read-only View modal.
   *  Mirrors the form input types so dates, selects, booleans, refs, and text
   *  all render as clean text instead of greyed-out disabled inputs. */
  displayFieldValue(field: FieldConfig): string {
    const raw = this.formValues[field.key];
    if (raw === null || raw === undefined || raw === '') return '—';
    switch (field.type) {
      case 'date':
      case 'dateonly': {
        const d = new Date(raw as string);
        if (!Number.isFinite(d.getTime())) return String(raw);
        return d.toLocaleDateString('en-CA');
      }
      case 'select': {
        const v = String(raw);
        const opt = field.options?.find(o => o.value === v);
        return opt ? opt.label : v.replace(/_/g, ' ');
      }
      case 'ref':
        return this.refLabel(field.key) || String(raw);
      case 'number':
        return String(raw);
      default:
        return String(raw);
    }
  }

  /** Maps a leave status value to the badge color used in the read-only view,
    so the status field visually matches the table badge. */
  leaveStatusBadgeClass(value: unknown): string {
    const v = String(value ?? '');
    switch (v) {
      case 'approved': return 'success';
      case 'rejected': return 'danger';
      case 'cancelled': return 'warning';
      case 'pending': return 'info';
      default: return '';
    }
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