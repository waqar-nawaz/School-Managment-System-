import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CredentialsDialogComponent, LoginCredential } from '../../shared/components/credentials-dialog/credentials-dialog.component';
import { RouterLink } from '@angular/router';
import { PermissionService } from '../../core/services/permission.service';

// Must match the backend ADMISSION_STATUS enum (utils/constants.ts).
// `withdrawn` was missing — backend allows admitted→withdrawn.
const STATUSES = ['enquiry', 'applied', 'shortlisted', 'admitted', 'rejected', 'waitlisted', 'withdrawn'];
// Statuses an application can start in (admitted/rejected/withdrawn are reached later).
const START_STATUSES = ['enquiry', 'applied', 'shortlisted', 'waitlisted'];
const OPEN = ['enquiry', 'applied', 'shortlisted', 'waitlisted'];

// Mirror of the backend state machine (admissions.routes.ts).
// Used by the per-row status dropdown so the user can only pick valid transitions.
// "admitted" is not a manual status: it happens only through "Register student".
const ADMISSION_TRANSITIONS: Record<string, string[]> = {
  enquiry: ['applied', 'rejected', 'waitlisted'],
  applied: ['shortlisted', 'rejected', 'waitlisted'],
  shortlisted: ['rejected', 'waitlisted'],
  waitlisted: ['rejected'],
  admitted: ['withdrawn'],
  rejected: [],
  withdrawn: [],
};

@Component({
  selector: 'app-admissions',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, IconComponent, ConfirmDialogComponent, CredentialsDialogComponent],
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
        <select class="form-control" style="max-width:180px" [(ngModel)]="status" (ngModelChange)="setPage(1)">
          <option value="">All statuses</option>
          @for (s of STATUSES; track s) { <option [value]="s">{{ s | titlecase }}</option> }
        </select>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>No</th><th>Student</th><th>Parent / guardian</th><th>Applied for</th><th>Applied on</th><th>Status</th><th style="width:330px;text-align:right">Actions</th></tr>
          </thead>
          <tbody>
            @for (app of apps; track app.id) {
              <tr>
                <td>{{ app.applicationNo }}</td>
                <td>{{ app.studentName }}<div class="form-hint" style="margin:0">{{ app.gender ? (app.gender | titlecase) : '' }}{{ app.dateOfBirth ? ' · born ' + (app.dateOfBirth | date: 'MMM d, y') : '' }}</div></td>
                <td>{{ app.guardianName || '—' }}<div class="form-hint" style="margin:0">{{ app.phone }}{{ app.phone && app.email ? ' · ' : '' }}{{ app.email }}</div></td>
                <td>{{ app.appliedClass || '—' }}</td>
                <td>{{ app.dateApplied | date: 'MMM d, y' }}</td>
                <td><span class="badge badge-{{ badgeOf(app.status) }}">{{ app.status }}</span></td>
                <td style="text-align:right;white-space:nowrap">
                  @if (isOpen(app.status) && canEdit) {
                    <button class="btn btn-sm btn-ghost" (click)="openEdit(app)"><app-icon name="edit" [size]="14" /> Edit</button>
                  }
                  @if (isOpen(app.status) && canRegister) {
                    <button class="btn btn-sm btn-primary" (click)="registerStudent(app)" title="Admit: create the student, enrolment and family logins">
                      <app-icon name="user-check" [size]="14" /> Register
                    </button>
                  }
                  @if (app.studentId) {
                    <a class="btn btn-sm btn-ghost" routerLink="/students" [queryParams]="{ open: app.studentId }"><app-icon name="users" [size]="14" /> View student</a>
                  }
                  @if (nextStatuses(app.status).length && canEdit) {
                    <select class="form-control form-control-sm" style="display:inline-block;width:auto;margin-left:.4rem" (change)="transition(app, $event)" aria-label="Change status">
                      <option value="">Move to…</option>
                      @for (st of nextStatuses(app.status); track st) { <option [value]="st">{{ st | titlecase }}</option> }
                    </select>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty-cell">{{ search || status ? 'No applications match your filters.' : 'No applications yet. Click “New application” to add one.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (total > 0) {
        <div class="pagination-bar">
          <span>{{ total }} application(s) — page {{ page }} of {{ totalPages }}</span>
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
            <div class="modal-title">{{ editingId ? 'Edit application' : 'New admission application' }}</div>
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
                <input type="date" class="form-control" name="dateOfBirth" [(ngModel)]="form.dateOfBirth" [max]="today" />
              </div>
              <div class="form-group">
                <label>Parent / guardian name</label>
                <input class="form-control" name="guardianName" [(ngModel)]="form.guardianName" placeholder="Who is applying?" />
              </div>
              <div class="form-group">
                <label>Relation</label>
                <select class="form-control" name="guardianRelation" [(ngModel)]="form.guardianRelation">
                  <option [ngValue]="null">—</option>
                  <option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option><option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label>Parent / guardian email</label>
                <input type="email" class="form-control" name="email" [(ngModel)]="form.email" />
              </div>
              <div class="form-group">
                <label>Parent / guardian phone</label>
                <input type="tel" class="form-control" name="phone" [(ngModel)]="form.phone" autocomplete="tel" placeholder="0300 1234567" />
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
              @if (!editingId) {
                <div class="form-group">
                  <label>Starting status</label>
                  <select class="form-control" name="status" [(ngModel)]="form.status">
                    @for (st of START_STATUSES; track st) { <option [value]="st">{{ st | titlecase }}</option> }
                  </select>
                </div>
              }
              <div class="form-group form-group-full">
                <label>Address</label>
                <input class="form-control" name="address" [(ngModel)]="form.address" />
              </div>
              <div class="form-group form-group-full">
                <label>Remarks</label>
                <textarea class="form-control" name="remarks" [(ngModel)]="form.remarks"></textarea>
              </div>
            </div>
            @if (formError) { <div class="field-error">{{ formError }}</div> }
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showForm = false"><app-icon name="x" [size]="14" /> Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : (editingId ? 'Save changes' : 'Save application') }}
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
            This creates the student record, the class enrolment and logins for the student and
            {{ reg.app.guardianName || 'the parent' }} ({{ reg.app.phone || reg.app.email || 'no contact given' }}), then marks the application as admitted.
            If this parent already has another child here, the same parent account is reused.
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

    @if (issued) {
      <app-credentials-dialog [title]="'Logins for ' + issued.name" [credentials]="issued.credentials" (close)="issued = null" />
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
  readonly START_STATUSES = START_STATUSES;
  readonly today = new Date().toLocaleDateString('en-CA');
  page = 1;
  readonly limit = 15;
  total = 0;
  editingId: number | null = null;
  formError = '';
  issued: { name: string; credentials: LoginCredential[] } | null = null;
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
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {}

  get canEdit(): boolean { return this.perms.hasPermission('admissions:update'); }
  get canRegister(): boolean { return this.perms.hasPermission('admissions:update') && this.perms.hasPermission('students:create'); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  isOpen(status: string): boolean { return OPEN.includes(status); }
  setPage(p: number): void { this.page = p; this.load(); }

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
    this.form = { status: 'enquiry', gender: null, guardianRelation: null };
    this.editingId = null;
    this.formError = '';
    this.showForm = true;
  }

  openEdit(app: any): void {
    this.form = {
      studentName: app.studentName, gender: app.gender ?? null, dateOfBirth: app.dateOfBirth ? String(app.dateOfBirth).slice(0, 10) : '',
      email: app.email ?? '', phone: app.phone ?? '', guardianName: app.guardianName ?? '', guardianRelation: app.guardianRelation ?? null,
      appliedClass: app.appliedClass, address: app.address ?? '', remarks: app.remarks ?? '',
    };
    this.editingId = app.id;
    this.formError = '';
    this.showForm = true;
  }

  save(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.formError = '';
    const body: Record<string, unknown> = { ...this.form };
    for (const k of ['dateOfBirth', 'email', 'phone', 'guardianName', 'address']) if (body[k] === '') body[k] = null;
    const req = this.editingId ? this.api.put(`/admissions/${this.editingId}`, body) : this.api.post('/admissions', body);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.toasts.success(this.editingId ? 'Application updated' : 'Application received');
        this.load();
        this.loadPipeline();
      },
      // Keep the form open and show the reason (e.g. "already has application APP-…") next to the buttons.
      error: (err) => {
        this.saving = false;
        this.formError = err?.error?.message || 'Could not save the application';
      },
    });
  }

  load(): void {
    // Send status filter as filter[status] so the backend crudFactory picks it up
    // (flat `status=` is ignored by buildWhere).
    const params: Record<string, unknown> = { page: this.page, limit: this.limit, q: this.search };
    if (this.status) params['filter[status]'] = this.status;
    this.api.get<any[]>('/admissions', params).subscribe({
      next: (res) => { this.apps = res?.data ?? []; this.total = res?.meta?.total ?? this.apps.length; },
      error: () => {},
    });
  }

  debouncedLoad(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.page = 1;
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
    if (!app?.id || !OPEN.includes(app.status)) return;
    const guess = this.classes.find((c) => String(c.name).trim().toLowerCase() === String(app.appliedClass ?? '').trim().toLowerCase());
    this.reg = { app, classId: guess ? Number(guess.id) : null, sectionId: null, busy: false, error: '' };
  }

  confirmRegister(): void {
    const r = this.reg;
    if (!r || !r.classId) return;
    r.busy = true;
    r.error = '';
    this.api.post(`/admissions/${r.app.id}/register`, { currentClassId: r.classId, currentSectionId: r.sectionId }).subscribe({
      next: (res: any) => {
        this.toasts.success(`${r.app.studentName} admitted as a student`);
        this.reg = null;
        this.load();
        this.loadPipeline();
        const creds: LoginCredential[] = res?.data?.credentials ?? [];
        if (creds.length) this.issued = { name: r.app.studentName, credentials: creds };
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
    const terminal = ['rejected', 'withdrawn'];
    if (terminal.includes(next)) {
      this.confirmDialog = {
        title: `Mark as ${next}`,
        message: next === 'withdrawn' ? `Withdraw "${app.studentName}"? Their student record will be deactivated too (class seat, login and any hostel bed are released).` : `Mark "${app.studentName}" as ${next}? This cannot be undone.`,
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
