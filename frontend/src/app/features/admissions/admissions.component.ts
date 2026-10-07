import { Component, HostListener, OnInit } from '@angular/core';
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
        <p class="page-subtitle">Application pipeline — track and admit prospective students.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openCreate()">
          <app-icon name="plus" [size]="15" /> New application
        </button>
      </div>
    </div>

    <div class="admission-pipeline">
      @for (s of STATUSES; track s) {
        <button type="button" class="pipeline-tile pipeline-tile-{{ badgeOf(s) || 'neutral' }}" [class.active]="status === s" (click)="toggleStatusFilter(s)" [title]="s | titlecase">
          <span class="pipeline-count">{{ pipeline[s] || 0 }}</span>
          <span class="pipeline-label">{{ s | titlecase }}</span>
        </button>
      }
    </div>

    <div class="card">
      <div class="card-toolbar admissions-toolbar">
        <div class="search-box admissions-search">
          <app-icon name="search" [size]="15" class="search-leading" />
          <input class="form-control" placeholder="Search applicant, guardian, phone, application no…" [(ngModel)]="search" (ngModelChange)="debouncedLoad()" />
          @if (search) {
            <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear search">
              <app-icon name="x" [size]="14" />
            </button>
          }
        </div>
        @if (status) {
          <button type="button" class="btn btn-sm btn-ghost admissions-clear-filter" (click)="status = ''; setPage(1); load()">
            <app-icon name="x" [size]="13" /> {{ status | titlecase }}
          </button>
        }
      </div>

      @if (loading) {
        <div class="admission-skel-list">
          @for (i of [1,2,3,4,5,6,7]; track i) {
            <div class="admission-row-skel">
              <div class="avatar-skel-sm"></div>
              <div class="admission-row-body">
                <div class="line-skel line-skel-name"></div>
                <div class="line-skel line-skel-meta"></div>
              </div>
              <div class="line-skel line-skel-badge"></div>
            </div>
          }
        </div>
      } @else {
        <div class="admission-list">
          @for (app of apps; track app.id) {
            <div class="admission-row" [class.admission-row-closed]="!isOpen(app.status)">
              <div class="admission-avatar admission-avatar-{{ badgeOf(app.status) || 'neutral' }}">
                {{ initials(app.studentName) }}
              </div>
              <div class="admission-row-main">
                <div class="admission-row-head">
                  <strong class="admission-name">{{ app.studentName }}</strong>
                  <span class="admission-no">{{ app.applicationNo }}</span>
                  <span class="admission-status-badge admission-status-{{ badgeOf(app.status) || 'neutral' }}">{{ app.status }}</span>
                </div>
                <div class="admission-row-meta">
                  @if (app.appliedClass) { <span class="meta-item"><app-icon name="home" [size]="12" /> {{ app.appliedClass }}</span> }
                  <span class="meta-item"><app-icon name="calendar" [size]="12" /> {{ app.dateApplied | date: 'MMM d, y' }}</span>
                  @if (app.guardianName) { <span class="meta-item"><app-icon name="users" [size]="12" /> {{ app.guardianName }}</span> }
                  @if (app.phone) { <span class="meta-item meta-mono"><app-icon name="phone" [size]="12" /> {{ app.phone }}</span> }
                  @if (app.studentId) { <span class="meta-item meta-linked"><app-icon name="user-check" [size]="12" /> Linked student</span> }
                </div>
              </div>
              <div class="admission-row-actions">
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
                  <div class="row-menu">
                    <button type="button" class="icon-btn" (click)="toggleRowMenu(app.id, $event)" aria-label="More actions">
                      <app-icon name="more-vertical" [size]="16" />
                    </button>
                    @if (openMenuId === app.id) {
                      <div class="row-menu-list" [style.top.px]="menuPos?.top" [style.right.px]="menuPos?.right" (click)="$event.stopPropagation()">
                        @for (st of nextStatuses(app.status); track st) {
                          <button type="button" class="row-menu-item" [class.danger]="st === 'rejected' || st === 'withdrawn'" (click)="transition(app, st); openMenuId = null">
                            <app-icon [name]="st === 'rejected' || st === 'withdrawn' ? 'x' : 'chevron-right'" [size]="15" /> Move to {{ st | titlecase }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          } @empty {
            <div class="admission-empty">
              <div class="admission-empty-icon"><app-icon name="clipboard" [size]="28" /></div>
              <strong>{{ hasFilters ? 'No matches' : 'No applications yet' }}</strong>
              <span>{{ hasFilters ? 'Try adjusting the search or status filter.' : 'Click "New application" to start the pipeline.' }}</span>
            </div>
          }
        </div>
      }

      @if (total > 0) {
        <div class="pagination-bar">
          <span class="pagination-count">Page {{ page }} of {{ totalPages || 1 }} · {{ total }} applications</span>
          <div class="page-actions">
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="setPage(page - 1)"><app-icon name="chevron-left" [size]="14" /> Prev</button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="setPage(page + 1)">Next <app-icon name="chevron-right" [size]="14" /></button>
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
  styles: [`
    /* Pipeline status tiles */
    .admission-pipeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .pipeline-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); cursor: pointer; text-align: left; color: inherit; transition: all .15s; }
    .pipeline-tile:hover { border-color: var(--primary); transform: translateY(-1px); }
    .pipeline-tile.active { border-color: var(--primary); background: var(--primary-light); }
    .pipeline-count { font-size: 22px; font-weight: 700; line-height: 1; color: var(--text); }
    .pipeline-tile.active .pipeline-count { color: var(--primary); }
    .pipeline-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: capitalize; }
    .pipeline-tile-success .pipeline-count { color: var(--success); }
    .pipeline-tile-danger .pipeline-count { color: var(--danger); }
    .pipeline-tile-warning .pipeline-count { color: var(--warning); }
    .pipeline-tile-info .pipeline-count { color: #1f6feb; }

    /* Toolbar */
    .admissions-toolbar { gap: 10px; }
    .admissions-search { flex: 1; position: relative; }
    .admissions-search .search-leading { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .admissions-search .form-control { padding-left: 32px; }
    .admissions-clear-filter { white-space: nowrap; flex-shrink: 0; }

    /* Admission list rows */
    .admission-list { display: flex; flex-direction: column; }
    .admission-row { display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--border); transition: background .15s; }
    .admission-row:last-child { border-bottom: 0; }
    .admission-row:hover { background: var(--row-hover); }
    .admission-row-closed { opacity: .68; }

    .admission-avatar { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: #fff; text-transform: uppercase; flex-shrink: 0; }
    .admission-avatar-success { background: var(--success); }
    .admission-avatar-info { background: #1f6feb; }
    .admission-avatar-danger { background: var(--danger); }
    .admission-avatar-warning { background: var(--warning); }
    .admission-avatar-neutral { background: var(--neutral-500); }

    .admission-row-main { min-width: 0; }
    .admission-row-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .admission-name { font-size: 14px; font-weight: 600; color: var(--text); }
    .admission-no { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text-muted); }
    .admission-status-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .admission-status-success { background: rgba(22,163,74,.12); color: var(--success); }
    .admission-status-info { background: rgba(31,111,235,.12); color: #1f6feb; }
    .admission-status-danger { background: rgba(192,57,43,.12); color: var(--danger); }
    .admission-status-warning { background: rgba(217,119,6,.14); color: var(--warning); }
    .admission-status-neutral { background: var(--neutral-100); color: var(--text-muted); }
    body.dark-theme .admission-status-success { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .admission-status-info { background: rgba(31,111,235,.22); color: #93c5fd; }
    body.dark-theme .admission-status-danger { background: rgba(192,57,43,.22); color: #fca5a5; }
    body.dark-theme .admission-status-warning { background: rgba(217,119,6,.22); color: #fcd34d; }

    .admission-row-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 5px; font-size: 11px; color: var(--text-muted); }
    .meta-item { display: inline-flex; align-items: center; gap: 4px; }
    .meta-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .meta-linked { color: var(--success); font-weight: 600; }

    .admission-row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

    /* Skeleton */
    .admission-skel-list { display: flex; flex-direction: column; }
    .admission-row-skel { display: grid; grid-template-columns: 44px 1fr 80px; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .avatar-skel-sm { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: admissions-shimmer 1.4s ease infinite; }
    .admission-row-body { display: flex; flex-direction: column; gap: 6px; }
    .line-skel { height: 10px; border-radius: 4px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: admissions-shimmer 1.4s ease infinite; }
    .line-skel-name { width: 200px; }
    .line-skel-meta { width: 280px; height: 9px; }
    .line-skel-badge { width: 80px; height: 18px; border-radius: 999px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: admissions-shimmer 1.4s ease infinite; }
    @keyframes admissions-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    /* Empty state */
    .admission-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 60px 24px; text-align: center; }
    .admission-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .admission-empty strong { font-size: 14px; color: var(--text); }
    .admission-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; line-height: 1.4; }

    .pagination-count { color: var(--text-muted); font-size: 12px; }

    @media (max-width: 760px) {
      .admission-row { grid-template-columns: 40px 1fr; }
      .admission-row-actions { grid-column: 1 / -1; justify-content: flex-start; margin-top: 6px; }
      .admission-row-meta .meta-mono { display: none; }
    }
  `],
})
export class AdmissionsComponent implements OnInit {
  readonly STATUSES = STATUSES;
  readonly START_STATUSES = START_STATUSES;
  readonly today = new Date().toLocaleDateString('en-CA');
  page = 1;
  readonly limit = 15;
  total = 0;
  loading = false;
  openMenuId: number | null = null;
  menuPos: { top: number; right: number } | null = null;
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
  get hasFilters(): boolean { return !!(this.search || this.status); }
  isOpen(status: string): boolean { return OPEN.includes(status); }
  setPage(p: number): void { this.page = p; this.load(); }

  /** Two-letter initials for the applicant avatar circle. */
  initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return name.charAt(0).toUpperCase();
  }

  toggleRowMenu(id: number, event: Event): void {
    event.stopPropagation();
    if (this.openMenuId === id) { this.openMenuId = null; return; }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
    this.openMenuId = id;
  }
  @HostListener('document:click')
  closeRowMenu(): void { this.openMenuId = null; }

  /** Click a pipeline tile to filter by that status; click again to clear. */
  toggleStatusFilter(s: string): void {
    this.status = (this.status === s) ? '' : s;
    this.page = 1;
    this.load();
  }

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
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.limit, q: this.search };
    if (this.status) params['filter[status]'] = this.status;
    this.api.get<any[]>('/admissions', params).subscribe({
      next: (res) => { this.apps = res?.data ?? []; this.total = res?.meta?.total ?? this.apps.length; this.loading = false; },
      error: () => { this.loading = false; },
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

  transition(app: any, nextOrEvent: string | Event): void {
    // Accept either a direct status string (from the row-menu) or a select-change Event (legacy).
    let next: string;
    if (typeof nextOrEvent === 'string') {
      next = nextOrEvent;
    } else {
      next = (nextOrEvent.target as HTMLSelectElement).value;
      (nextOrEvent.target as HTMLSelectElement).value = '';
    }
    if (!next || next === app.status) return;
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
