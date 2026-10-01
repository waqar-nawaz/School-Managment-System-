import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

// Must match the backend ADMISSION_STATUS enum (utils/constants.ts).
// `withdrawn` was missing — backend allows admitted→withdrawn.
const STATUSES = ['enquiry', 'applied', 'shortlisted', 'admitted', 'rejected', 'waitlisted', 'withdrawn'];

// Mirror of the backend state machine (admissions.routes.ts).
// Used by the per-row status dropdown so the user can only pick valid transitions.
const ADMISSION_TRANSITIONS: Record<string, string[]> = {
  enquiry: ['applied', 'admitted', 'rejected', 'waitlisted'],
  applied: ['shortlisted', 'admitted', 'rejected', 'waitlisted'],
  shortlisted: ['admitted', 'rejected', 'waitlisted'],
  waitlisted: ['admitted', 'rejected'],
  admitted: ['withdrawn'],
  rejected: [],
  withdrawn: [],
};

@Component({
  selector: 'app-admissions',
  standalone: true,
  imports: [FormsModule, CommonModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Admissions</h1>
        <p class="page-subtitle">Application pipeline</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openCreate()">
          <app-icon name="plus" [size]="15" /> New application
        </button>
      </div>
    </div>

    <div class="stat-grid stat-grid-sm">
      @for (s of STATUSES; track s) {
        <div class="mini-card">
          <span class="stat-label">{{ s | titlecase }}</span>
          <span class="stat-value">{{ pipeline[s] || 0 }}</span>
        </div>
      }
    </div>

    <div class="card">
      <div class="card-toolbar">
        <div class="search-box">
          <input class="form-control" placeholder="Search application…" [(ngModel)]="search" (ngModelChange)="debouncedLoad()" />
          @if (search) {
            <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear search">
              <app-icon name="x" [size]="14" />
            </button>
          }
        </div>
        <select class="form-control" style="max-width:180px" [(ngModel)]="status" (ngModelChange)="load()">
          <option value="">All statuses</option>
          @for (s of STATUSES; track s) { <option [value]="s">{{ s | titlecase }}</option> }
        </select>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>No</th><th>Student</th><th>Email</th><th>Phone</th><th>Applied To</th><th>Applied On</th><th>Status</th><th style="width:230px;text-align:right">Action</th></tr>
          </thead>
          <tbody>
            @for (app of apps; track app.id) {
              <tr>
                <td>{{ app.applicationNo }}</td>
                <td>{{ app.studentName }}</td>
                <td>{{ app.email }}</td>
                <td>{{ app.phone }}</td>
                <td>{{ app.appliedClass || '—' }}</td>
                <td>{{ app.dateApplied | date: 'MMM d, y' }}</td>
                <td><span class="badge badge-{{ badgeOf(app.status) }}">{{ app.status }}</span></td>
                <td style="text-align:right;white-space:nowrap">
                  @if (app.status !== 'admitted' && app.status !== 'rejected') {
                    <button class="btn btn-sm btn-ghost" (click)="registerStudent(app)" title="Create a student record from this application">
                      <app-icon name="user-check" [size]="14" /> Register
                    </button>
                  }
                  <select class="form-control form-control-sm" style="display:inline-block;width:auto;margin-left:.4rem" [value]="app.status" (change)="transition(app, $event)">
                    @for (s of nextStatuses(app.status); track s) { <option [value]="s">{{ s | titlecase }}</option> }
                    @if (nextStatuses(app.status).length === 0) {
                      <option [value]="app.status" disabled>{{ app.status | titlecase }} (terminal)</option>
                    }
                  </select>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty-cell">No applications yet. Click “New application” to add one.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (showForm) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">New admission application</div>
            <button type="button" class="modal-close" (click)="showForm = false" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <form (ngSubmit)="save(f)" #f="ngForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Student name *</label>
                <input class="form-control" name="studentName" [(ngModel)]="form.studentName" required #studentName="ngModel" />
                @if (f.submitted && studentName.invalid) {
                  <div class="field-error">Student name is required</div>
                }
              </div>
              <div class="form-group">
                <label>Gender</label>
                <select class="form-control" name="gender" [(ngModel)]="form.gender">
                  <option [ngValue]="null">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label>Date of birth</label>
                <input type="date" class="form-control" name="dateOfBirth" [(ngModel)]="form.dateOfBirth" />
              </div>
              <div class="form-group">
                <label>Parent / guardian email</label>
                <input type="email" class="form-control" name="email" [(ngModel)]="form.email" />
              </div>
              <div class="form-group">
                <label>Parent / guardian phone</label>
                <input type="tel" class="form-control" name="phone" [(ngModel)]="form.phone" autocomplete="tel" />
              </div>
              <div class="form-group">
                <label>Applied for class *</label>
                @if (classes.length) {
                  <select class="form-control" name="appliedClass" [(ngModel)]="form.appliedClass" required>
                    <option [ngValue]="undefined" disabled>Select a class…</option>
                    @for (c of classes; track c.id) { <option [value]="c.name">{{ c.name }}</option> }
                  </select>
                } @else {
                  <input class="form-control" name="appliedClass" [(ngModel)]="form.appliedClass" placeholder="e.g. Grade 5" required />
                }
                @if (f.submitted && f.controls['appliedClass'].invalid) {
                  <div class="field-error">Please choose the class applied for</div>
                }
                <div class="field-hint">Used as the default class when the student is registered.</div>
              </div>
              <div class="form-group">
                <label>Status</label>
                <select class="form-control" name="status" [(ngModel)]="form.status">
                  @for (s of STATUSES; track s) { <option [value]="s">{{ s | titlecase }}</option> }
                </select>
              </div>
              <div class="form-group form-group-full">
                <label>Address</label>
                <input class="form-control" name="address" [(ngModel)]="form.address" />
              </div>
              <div class="form-group form-group-full">
                <label>Remarks</label>
                <textarea class="form-control" name="remarks" [(ngModel)]="form.remarks"></textarea>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showForm = false"><app-icon name="x" [size]="14" /> Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save application' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (reg) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">Register {{ reg.app.studentName }} as a student</div>
            <button type="button" class="modal-close" (click)="reg = null" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <p class="page-subtitle" style="margin:0 0 1rem">
            This creates the student record, a parent-portal login for the guardian
            ({{ reg.app.email || reg.app.phone || 'no contact given' }}) and the class enrolment, then marks the application as admitted.
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label>Class *</label>
              <select class="form-control" name="regClass" [(ngModel)]="reg.classId" (ngModelChange)="reg.sectionId = null">
                <option [ngValue]="null" disabled>Select class…</option>
                @for (c of classes; track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
              </select>
            </div>
            <div class="form-group">
              <label>Section</label>
              <select class="form-control" name="regSection" [(ngModel)]="reg.sectionId" [disabled]="!reg.classId">
                <option [ngValue]="null">No section yet</option>
                @for (sec of sectionsOf(reg.classId); track sec.id) { <option [ngValue]="sec.id">Section {{ sec.name }}{{ sec.capacity ? ' (capacity ' + sec.capacity + ')' : '' }}</option> }
              </select>
            </div>
          </div>
          @if (reg.error) { <div class="field-error" style="margin-top:.5rem">{{ reg.error }}</div> }
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="reg = null">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="reg.busy || !reg.classId" (click)="confirmRegister()">
              <app-icon name="user-check" [size]="14" /> {{ reg.busy ? 'Registering…' : 'Register student' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (confirmDialog) {
      <app-confirm-dialog
        [title]="confirmDialog.title"
        [message]="confirmDialog.message"
        (confirm)="confirmDialog.onConfirm()"
        (close)="confirmDialog = null"
      />
    }
  `,
})
export class AdmissionsComponent implements OnInit {
  readonly STATUSES = STATUSES;
  apps: any[] = [];
  pipeline: Record<string, number> = {};
  search = '';
  status = '';
  showForm = false;
  saving = false;
  form: Record<string, any> = {};
  classes: any[] = [];
  sections: any[] = [];
  reg: { app: any; classId: number | null; sectionId: number | null; busy: boolean; error: string } | null = null;
  confirmDialog: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void } | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadPipeline();
    this.api.get<any[]>('/classes', { limit: 200 }).subscribe({ next: (r) => (this.classes = r?.data ?? []), error: () => {} });
    this.api.get<any[]>('/sections', { limit: 500 }).subscribe({ next: (r) => (this.sections = r?.data ?? []), error: () => {} });
  }

  sectionsOf(classId: number | null): any[] {
    return classId ? this.sections.filter((x) => Number(x.classId) === Number(classId)) : [];
  }

  clearSearch(): void {
    this.search = '';
    this.load();
  }

  openCreate(): void {
    this.form = { status: 'enquiry', gender: null };
    this.showForm = true;
  }

  save(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.api.post('/admissions', this.form).subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.toasts.success('Application received');
        this.load();
        this.loadPipeline();
      },
      error: () => {
        this.saving = false;
      },
    });
  }

  load(): void {
    // Send status filter as filter[status] so the backend crudFactory picks it up
    // (flat `status=` is ignored by buildWhere).
    const params: Record<string, unknown> = { page: 1, limit: 200, q: this.search };
    if (this.status) params['filter[status]'] = this.status;
    this.api.get<any[]>('/admissions', params).subscribe({
      next: (res) => (this.apps = res?.data ?? []),
      error: () => {},
    });
  }

  debouncedLoad(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.load();
    }, 300);
  }

  /** Compute the list of statuses the user may transition to from the current status. */
  nextStatuses(current: string): string[] {
    return ADMISSION_TRANSITIONS[current] ?? [];
  }

  loadPipeline(): void {
    this.api.get<Record<string, number>>('/admissions/stats/pipeline').subscribe({
      next: (res) => (this.pipeline = res?.data ?? {}),
      error: () => {},
    });
  }

  /** Open the register dialog (class/section are chosen here instead of being silently skipped). */
  registerStudent(app: any): void {
    if (!app?.id || ['admitted', 'rejected', 'withdrawn'].includes(app.status)) return;
    const guess = this.classes.find((c) => String(c.name).trim().toLowerCase() === String(app.appliedClass ?? '').trim().toLowerCase());
    this.reg = { app, classId: guess ? Number(guess.id) : null, sectionId: null, busy: false, error: '' };
  }

  confirmRegister(): void {
    const r = this.reg;
    if (!r || !r.classId) return;
    r.busy = true;
    r.error = '';
    this.api.post(`/admissions/${r.app.id}/register`, { currentClassId: r.classId, currentSectionId: r.sectionId }).subscribe({
      next: () => {
        this.toasts.success(`${r.app.studentName} admitted as a student`);
        this.reg = null;
        this.load();
        this.loadPipeline();
      },
      error: (err) => {
        // Keep the dialog open so the user can pick another section if this one is full.
        r.busy = false;
        r.error = err?.error?.message || 'Could not register student from application';
      },
    });
  }

  transition(app: any, event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    (event.target as HTMLSelectElement).value = '';
    if (!next || next === app.status) return;
    // Confirm before terminal / irreversible transitions (rejected, withdrawn, admitted).
    const terminal = ['rejected', 'withdrawn', 'admitted'];
    if (terminal.includes(next)) {
      this.confirmDialog = {
        title: `Mark as ${next}`,
        message: `Are you sure you want to mark "${app.studentName}" as ${next}? This action cannot be undone.`,
        confirmLabel: `Mark as ${next}`,
        danger: next === 'rejected' || next === 'withdrawn',
        onConfirm: () => {
          this.confirmDialog = null;
          this.doTransition(app, next);
        },
      };
      return;
    }
    this.doTransition(app, next);
  }

  private doTransition(app: any, next: string): void {
    this.api.patch(`/admissions/${app.id}/status`, { status: next }).subscribe({
      next: () => {
        app.status = next;
        this.toasts.success(`Application moved to ${next}`);
        this.load();
        this.loadPipeline();
      },
      error: (err) => {
        this.toasts.error(err?.error?.message || `Could not transition to ${next}`);
      },
    });
  }

  badgeOf(s: string): string {
    return ({ admitted: 'success', shortlisted: 'info', rejected: 'danger', waitlisted: 'warning', withdrawn: 'warning', applied: 'info', enquiry: '' } as Record<string, string>)[s] ?? '';
  }
}
