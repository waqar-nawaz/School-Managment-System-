import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { switchMap, tap, takeUntil, debounceTime } from 'rxjs/operators';
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
          <p class="page-subtitle">Manage {{ config.label.toLowerCase() }}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" (click)="load()"><app-icon name="refresh" [size]="15" /> Refresh</button>
          @if (canExport) {
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
          <div class="search-box">
            <input
              type="text"
              class="form-control"
              placeholder="Search {{ config.label.toLowerCase() }}…"
              [value]="searchText"
              (input)="onSearch($event)" />
            @if (searchText) {
              <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear search">
                <app-icon name="x" [size]="14" />
              </button>
            }
          </div>
        </div>

        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                @for (col of config.columns; track col.key) {
                  <th>{{ col.label }}</th>
                }
                <th style="width:150px;text-align:right">Actions</th>
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
                        @default { <span>{{ display(col, row[col.key]) }}</span> }
                      }
                    </td>
                  }
                  <td style="text-align:right;white-space:nowrap">
                    @if (config.canCreate !== false && canEdit) {
                      <button class="btn btn-sm btn-ghost" (click)="openEdit(row)"><app-icon name="edit" [size]="14" /> Edit</button>
                    }
                    @if (config.canCreate !== false && canDelete) {
                      <button class="btn btn-sm btn-ghost-danger" (click)="askDelete(row)"><app-icon name="trash" [size]="14" /> Delete</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td [attr.colspan]="config.columns.length + 1" class="empty-cell">No records found.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination-bar">
          <div class="pagination-info">
            <span>Page {{ page }} of {{ totalPages || 1 }} ({{ total }} records)</span>
            <select class="form-control form-control-sm" style="max-width:120px" [ngModel]="pageSize" (ngModelChange)="setPageSize($event)">
              @for (size of [10, 20, 50, 100]; track size) {
                <option [ngValue]="size">{{ size }} / page</option>
              }
            </select>
          </div>
          <div class="page-actions">
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
              @for (field of config.fields; track field.key) {
                <div class="form-group" [class.form-group-full]="field.type === 'textarea'">
                  <label>{{ field.label }} @if (field.required) {<span class="text-danger"> *</span>}</label>
                  @switch (field.type) {
                    @case ('textarea') {
                      <textarea class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]"></textarea>
                    }
                    @case ('number') {
                      <input type="number" class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]" />
                    }
                    @case ('bool') {
                      <input type="checkbox" class="form-checkbox" name="{{ field.key }}" [(ngModel)]="formValues[field.key]" />
                    }
                    @case ('select') {
                      <select class="form-control" name="{{ field.key }}" [(ngModel)]="formValues[field.key]">
                        <option [ngValue]="null">— select —</option>
                        @for (opt of field.options ?? []; track opt.value) {
                          <option [ngValue]="opt.value">{{ opt.label }}</option>
                        }
                      </select>
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
  `,
})
export class CrudResourceComponent implements OnInit, OnDestroy {
  @Input() set resource(v: string) {
    this.resourceKey = v || this.route.snapshot.paramMap.get('resource') || '';
    this.config = resolveResource(this.resourceKey);
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
  fieldErrors: Record<string, string> = {};
  confirm: Row | null = null;
  canCreate = false;
  canEdit = false;
  canDelete = false;
  canExport = false;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();
  private saveBusy = false;

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
    const base = this.resourceKey.split('/')[0];
    this.canCreate = this.perms.hasPermission(`${base}:create`) || this.perms.hasPermission(`${base}:manage`);
    this.canEdit = this.perms.hasPermission(`${base}:update`) || this.perms.hasPermission(`${base}:manage`);
    this.canDelete = this.perms.hasPermission(`${base}:delete`) || this.perms.hasPermission(`${base}:manage`);
    this.canExport = this.perms.hasPermission(`${base}:read`) || this.canDelete;
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

  setPageSize(size: number): void {
    this.pageSize = size;
    this.load();
  }

  setPage(p: number): void {
    this.page = p;
    this.load();
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize);
  }

  load(): void {
    if (!this.config) return;
    this.api
      .get<Row[]>(this.config.api, { page: this.page, limit: this.pageSize, q: this.search })
      .subscribe({
        next: (res) => {
          this.rows = (res?.data as Row[]) ?? [];
          this.total = res?.meta?.total ?? this.rows.length;
        },
        error: () => {},
      });
  }

  openCreate(): void {
    this.editingId = null;
    this.formValues = {};
    this.fieldErrors = {};
    this.formTitle = `New ${this.config?.label.replace(/s$/, '')}`;
    this.showForm = true;
  }

  openEdit(row: Row): void {
    this.editingId = row.id as number ?? null;
    this.formValues = { ...row };
    this.fieldErrors = {};
    this.formTitle = `Edit ${this.config?.label.replace(/s$/, '')}`;
    this.showForm = true;
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
      let v = this.formValues[f.key];
      if (v === '' || v === null || v === undefined) v = this.formDefault(f);
      if (v !== undefined) body[f.key] = v;
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
      error: () => {
        this.saving = false;
        this.saveBusy = false;
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
    this.api.get(`${this.config?.api}/export`).subscribe({
      next: (res) => {
        const csv = res?.data;
        if (typeof csv !== 'string') {
          this.toasts.error('Export failed');
          return;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.resourceKey}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: () => {},
    });
  }

  badgeClass(col: { badgeMap?: Record<string, string> }, value: unknown): string {
    const key = String(value ?? '');
    return col.badgeMap?.[key] ?? '';
  }

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
    const s = localStorage.getItem('sms_currency');
    return s && s.length === 3 ? s : 'PKR';
  }
}