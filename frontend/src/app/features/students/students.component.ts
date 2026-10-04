import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { formatMoney } from '../../core/utils/currency';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CredentialsDialogComponent, LoginCredential } from '../../shared/components/credentials-dialog/credentials-dialog.component';

interface GuardianRow { fullName: string; relation: string; phone: string; email: string; known?: string }

const blankForm = () => ({
  firstName: '', lastName: '', gender: '' as string, dateOfBirth: '', currentClassId: null as number | null, currentSectionId: null as number | null,
  rollNo: '', admissionDate: new Date().toLocaleDateString('en-CA'), bloodGroup: '', religion: '', nationality: '', email: '',
  emergencyContact: '', address: '', medicalNotes: '',
});

@Component({
  selector: 'app-students',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmDialogComponent, CredentialsDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Students</h1>
        <p class="page-subtitle">{{ canManage ? 'Admit, edit and look after student records.' : 'Student records.' }}</p>
      </div>
      <div class="page-actions">
        @if (canExport) { <button class="btn btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" /> Export</button> }
        @if (canCreate) { <button class="btn btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="15" /> Admit student</button> }
      </div>
    </div>

    @if (canManage) {
      <div class="tabs" style="margin-bottom:.75rem">
        <button type="button" class="btn btn-sm" [class.btn-primary]="tab === 'active'" [class.btn-ghost]="tab !== 'active'" (click)="setTab('active')">Current students</button>
        <button type="button" class="btn btn-sm" [class.btn-primary]="tab === 'inactive'" [class.btn-ghost]="tab !== 'inactive'" (click)="setTab('inactive')">Left school / inactive</button>
      </div>
    }

    <div class="card">
      <div class="card-toolbar">
        <div class="search-box">
          <input class="form-control" placeholder="Search name, admission no, guardian, phone…" [(ngModel)]="search" (ngModelChange)="searchInput$.next()" />
          @if (search) { <button type="button" class="search-clear" (click)="search = ''; reload()" aria-label="Clear search"><app-icon name="x" [size]="14" /></button> }
        </div>
        <select class="form-control" style="max-width:170px" [(ngModel)]="classFilter" (ngModelChange)="sectionFilter = ''; reload()">
          <option value="">All classes</option>
          @for (c of classes; track c.id) { <option [value]="c.id">{{ c.name }}</option> }
        </select>
        @if (classFilter) {
          <select class="form-control" style="max-width:130px" [(ngModel)]="sectionFilter" (ngModelChange)="reload()">
            <option value="">All sections</option>
            @for (s of sectionsOf(+classFilter); track s.id) { <option [value]="s.id">Section {{ s.name }}</option> }
          </select>
        }
      </div>

      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Student</th><th>Class</th><th>Roll</th><th>Parent / guardian</th><th>Status</th><th style="width:230px;text-align:right">Actions</th></tr></thead>
          <tbody>
            @for (s of rows; track s.id) {
              <tr>
                <td>
                  <a href="javascript:void(0)" (click)="openProfile(s.id)" style="font-weight:600">{{ s.firstName }} {{ s.lastName }}</a>
                  <div class="form-hint" style="margin:0">{{ s.admissionNo }}{{ s.gender ? ' · ' + (s.gender | titlecase) : '' }}</div>
                </td>
                <td>{{ classLabel(s) }}</td>
                <td>{{ rollOf(s) }}</td>
                <td>{{ s.guardianName || '—' }}<div class="form-hint" style="margin:0">{{ s.guardianPhone }}</div></td>
                <td><span class="badge badge-{{ s.isActive ? 'success' : 'danger' }}">{{ s.isActive ? 'Active' : 'Inactive' }}</span></td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-sm btn-ghost" (click)="openProfile(s.id)"><app-icon name="eye" [size]="14" /> View</button>
                  @if (canUpdate) {
                    <button class="btn btn-sm btn-ghost" (click)="openEdit(s)"><app-icon name="edit" [size]="14" /> Edit</button>
                    @if (s.isActive) { <button class="btn btn-sm btn-ghost" (click)="askDeactivate(s)" aria-label="Deactivate"><app-icon name="lock" [size]="14" /></button> }
                    @else { <button class="btn btn-sm btn-primary" (click)="reactivate(s)">Reactivate</button> }
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty-cell">{{ loading ? 'Loading…' : (search || classFilter ? 'No students match your filters.' : (tab === 'inactive' ? 'No inactive students.' : 'No students yet. Click “Admit student” or register an admission application.')) }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (total > limit) {
        <div class="pagination-bar">
          <span>{{ total }} student(s) — page {{ page }} of {{ totalPages }}</span>
          <div>
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="setPage(page - 1)"><app-icon name="chevron-left" [size]="14" /></button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="setPage(page + 1)"><app-icon name="chevron-right" [size]="14" /></button>
          </div>
        </div>
      }
    </div>

    <!-- ============================== add / edit ============================== -->
    @if (showForm) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">{{ editingId ? 'Edit student' : 'Admit a new student' }}</div>
            <button type="button" class="modal-close" (click)="showForm = false" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <form (ngSubmit)="save()" #f="ngForm" novalidate>
            <h4 class="form-section">Student</h4>
            <div class="form-grid">
              <div class="form-group">
                <label>First name *</label>
                <input class="form-control" name="firstName" [(ngModel)]="form.firstName" required #fn="ngModel" />
                @if ((f.submitted || fn.touched) && fn.invalid) { <div class="field-error">First name is required</div> }
              </div>
              <div class="form-group"><label>Last name</label><input class="form-control" name="lastName" [(ngModel)]="form.lastName" /></div>
              <div class="form-group">
                <label>Gender *</label>
                <select class="form-control" name="gender" [(ngModel)]="form.gender" required #gn="ngModel">
                  <option value="" disabled>Select…</option>
                  <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>
                @if ((f.submitted || gn.touched) && gn.invalid) { <div class="field-error">Gender is required</div> }
              </div>
              <div class="form-group"><label>Date of birth</label><input type="date" class="form-control" name="dateOfBirth" [(ngModel)]="form.dateOfBirth" [max]="today" /></div>
              <div class="form-group">
                <label>Class *</label>
                <select class="form-control" name="currentClassId" [(ngModel)]="form.currentClassId" (ngModelChange)="form.currentSectionId = null" required #cn="ngModel">
                  <option [ngValue]="null" disabled>Select class…</option>
                  @for (c of classes; track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
                </select>
                @if ((f.submitted || cn.touched) && cn.invalid) { <div class="field-error">Class is required</div> }
              </div>
              <div class="form-group">
                <label>Section</label>
                <select class="form-control" name="currentSectionId" [(ngModel)]="form.currentSectionId" [disabled]="!form.currentClassId">
                  <option [ngValue]="null">{{ form.currentClassId ? 'No section yet' : 'Choose a class first' }}</option>
                  @for (s of sectionsOf(form.currentClassId); track s.id) { <option [ngValue]="s.id">Section {{ s.name }}{{ s.capacity ? ' (capacity ' + s.capacity + ')' : '' }}</option> }
                </select>
              </div>
              <div class="form-group">
                <label>Roll number</label>
                <input class="form-control" name="rollNo" [(ngModel)]="form.rollNo" placeholder="Automatic" [disabled]="!form.currentSectionId && !editingId" />
                <div class="form-hint">Leave empty to give the next number in the section.</div>
              </div>
              <div class="form-group"><label>Admission date</label><input type="date" class="form-control" name="admissionDate" [(ngModel)]="form.admissionDate" [max]="today" /></div>
              <div class="form-group"><label>Blood group</label><input class="form-control" name="bloodGroup" [(ngModel)]="form.bloodGroup" placeholder="e.g. B+" /></div>
              <div class="form-group"><label>Religion</label><input class="form-control" name="religion" [(ngModel)]="form.religion" /></div>
              <div class="form-group"><label>Nationality</label><input class="form-control" name="nationality" [(ngModel)]="form.nationality" /></div>
              <div class="form-group"><label>Emergency contact</label><input type="tel" class="form-control" name="emergencyContact" [(ngModel)]="form.emergencyContact" placeholder="0300 1234567" /></div>
              <div class="form-group"><label>Student email (optional)</label><input type="email" class="form-control" name="email" [(ngModel)]="form.email" /></div>
              <div class="form-group form-group-full"><label>Address</label><input class="form-control" name="address" [(ngModel)]="form.address" /></div>
              @if (canSeeMedical) {
                <div class="form-group form-group-full"><label>Medical notes</label><textarea class="form-control" name="medicalNotes" [(ngModel)]="form.medicalNotes" placeholder="Allergies, conditions, medicines…"></textarea></div>
              }
            </div>

            @if (!editingId) {
              <h4 class="form-section">Parents / guardians</h4>
              <p class="form-hint" style="margin-top:0">They get a parent-portal login. A parent who already has another child here is recognised by phone number and reused.</p>
              @for (g of guardians; track $index) {
                <div class="guardian-row">
                  <input class="form-control" placeholder="Full name" [(ngModel)]="g.fullName" [name]="'gn' + $index" />
                  <select class="form-control" [(ngModel)]="g.relation" [name]="'gr' + $index">
                    <option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option><option value="other">Other</option>
                  </select>
                  <input type="tel" class="form-control" placeholder="Phone" [(ngModel)]="g.phone" [name]="'gp' + $index" (blur)="lookupGuardian(g)" />
                  <input type="email" class="form-control" placeholder="Email (optional)" [(ngModel)]="g.email" [name]="'ge' + $index" />
                  @if (guardians.length > 1) { <button type="button" class="btn btn-sm btn-ghost-danger" (click)="guardians.splice($index, 1)" aria-label="Remove"><app-icon name="x" [size]="12" /></button> }
                  @if (g.known) { <div class="form-hint guardian-known">Already registered: {{ g.known }}. Their existing account will be linked to this child.</div> }
                </div>
              }
              <button type="button" class="btn btn-sm btn-ghost" (click)="addGuardian()"><app-icon name="plus" [size]="12" /> Add another guardian</button>
            }

            @if (formError) { <div class="field-error" style="margin-top:.75rem">{{ formError }}</div> }
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showForm = false">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving"><app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : (editingId ? 'Save changes' : 'Admit student') }}</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ============================== profile ============================== -->
    @if (profile) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">{{ profile.student.firstName }} {{ profile.student.lastName }}
              <span class="badge badge-{{ profile.student.isActive ? 'success' : 'danger' }}" style="margin-left:.5rem">{{ profile.student.isActive ? 'Active' : 'Inactive' }}</span></div>
            <button type="button" class="modal-close" (click)="profile = null" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="profile-grid">
            <div><span class="stat-label">Admission no</span><div>{{ profile.student.admissionNo }}</div></div>
            <div><span class="stat-label">Class</span><div>{{ profile.className || '—' }}{{ profile.sectionName ? ' · ' + profile.sectionName : '' }}{{ profile.rollNo ? ' · roll ' + profile.rollNo : '' }}</div></div>
            <div><span class="stat-label">Gender</span><div>{{ profile.student.gender ? (profile.student.gender | titlecase) : '—' }}</div></div>
            <div><span class="stat-label">Date of birth</span><div>{{ profile.student.dateOfBirth ? (profile.student.dateOfBirth | date: 'MMM d, y') : '—' }}</div></div>
            <div><span class="stat-label">Admitted on</span><div>{{ profile.student.admissionDate ? (profile.student.admissionDate | date: 'MMM d, y') : '—' }}</div></div>
            <div><span class="stat-label">Blood group</span><div>{{ profile.student.bloodGroup || '—' }}</div></div>
            <div><span class="stat-label">Religion / nationality</span><div>{{ profile.student.religion || '—' }} / {{ profile.student.nationality || '—' }}</div></div>
            <div><span class="stat-label">Emergency contact</span><div>{{ profile.student.emergencyContact || '—' }}</div></div>
            <div style="grid-column:1/-1"><span class="stat-label">Address</span><div>{{ profile.student.address || '—' }}</div></div>
            @if (profile.student.medicalInfo?.notes) { <div style="grid-column:1/-1"><span class="stat-label">Medical notes</span><div>{{ profile.student.medicalInfo.notes }}</div></div> }
          </div>

          <h4 class="form-section">Parents / guardians</h4>
          @for (g of profile.guardians; track g.parentId) {
            <div class="profile-line"><strong>{{ g.fullName }}</strong> <span class="badge">{{ g.relation }}</span>{{ g.isPrimary ? ' (primary)' : '' }}<span class="form-hint" style="margin:0 0 0 .5rem">{{ g.phone }}{{ g.phone && g.email ? ' · ' : '' }}{{ g.email }}</span></div>
          } @empty { <div class="form-hint">No guardian linked. The parent portal will not work for this child until one is added.</div> }

          <div class="profile-cards">
            @if (profile.attendance) {
              <div class="mini-card"><span class="stat-label">Attendance ({{ profile.attendance.month }})</span>
                <span>{{ profile.attendance.summary['present'] || 0 }} present · {{ profile.attendance.summary['absent'] || 0 }} absent · {{ profile.attendance.summary['late'] || 0 }} late</span></div>
            }
            @if (profile.fees) {
              <div class="mini-card"><span class="stat-label">Fees</span>
                <span>Billed {{ money(profile.fees.billed) }} · Paid {{ money(profile.fees.paid) }}</span>
                <strong [style.color]="profile.fees.outstanding > 0 ? '#dc2626' : 'inherit'">Outstanding {{ money(profile.fees.outstanding) }}</strong></div>
            }
            @if (profile.hostel) {
              <div class="mini-card"><span class="stat-label">Hostel</span><span>{{ profile.hostel.hostel }} · room {{ profile.hostel.room }} · bed {{ profile.hostel.bed }}</span></div>
            }
            @if (profile.application) {
              <div class="mini-card"><span class="stat-label">Admission application</span><span>{{ profile.application.applicationNo }}</span></div>
            }
          </div>

          <div class="modal-actions">
            @if (canResetLogins) { <button class="btn btn-ghost" (click)="confirmReset = true"><app-icon name="lock" [size]="14" /> Reset family logins</button> }
            @if (canUpdate) { <button class="btn btn-ghost" (click)="editFromProfile()"><app-icon name="edit" [size]="14" /> Edit</button> }
            <button class="btn btn-primary" (click)="profile = null">Close</button>
          </div>
        </div>
      </div>
    }

    @if (confirmDeactivate) {
      <app-confirm-dialog
        title="Deactivate this student?"
        [message]="confirmDeactivate.firstName + ' ' + confirmDeactivate.lastName + ' will be removed from the class (the seat is freed), the student login is disabled and any hostel bed is released. Records and history are kept, and you can reactivate later.'"
        confirmLabel="Deactivate" [danger]="true"
        (confirm)="deactivate()" (close)="confirmDeactivate = null" />
    }
    @if (confirmReset) {
      <app-confirm-dialog
        title="Reset family logins?"
        message="New passwords are generated for the student and every linked parent. The old passwords stop working immediately."
        confirmLabel="Reset passwords"
        (confirm)="resetLogins()" (close)="confirmReset = false" />
    }
    @if (issued) { <app-credentials-dialog [title]="issued.title" [credentials]="issued.credentials" (close)="issued = null" /> }
  `,
  styles: [`
    .form-section { margin: 1rem 0 .5rem; font-size: .95rem; opacity: .8; }
    .guardian-row { display: grid; grid-template-columns: 1.4fr 1fr 1.1fr 1.4fr auto; gap: .5rem; margin-bottom: .5rem; align-items: center; }
    .guardian-known { grid-column: 1 / -1; color: #16a34a; margin: 0; }
    .profile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: .75rem 1.25rem; }
    .profile-line { padding: .35rem 0; border-bottom: 1px solid rgba(127,127,127,.15); }
    .profile-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: .75rem; margin-top: 1rem; }
    .profile-cards .mini-card { display: flex; flex-direction: column; gap: .25rem; }
    @media (max-width: 800px) { .guardian-row { grid-template-columns: 1fr 1fr; } }
  `],
})
export class StudentsComponent implements OnInit, OnDestroy {
  rows: any[] = [];
  total = 0;
  page = 1;
  readonly limit = 15;
  loading = false;
  tab: 'active' | 'inactive' = 'active';
  search = '';
  classFilter = '';
  sectionFilter = '';
  classes: any[] = [];
  sections: any[] = [];
  readonly today = new Date().toLocaleDateString('en-CA');

  showForm = false;
  editingId: number | null = null;
  form = blankForm();
  guardians: GuardianRow[] = [{ fullName: '', relation: 'father', phone: '', email: '' }];
  saving = false;
  formError = '';

  profile: any = null;
  confirmDeactivate: any = null;
  confirmReset = false;
  issued: { title: string; credentials: LoginCredential[] } | null = null;

  readonly searchInput$ = new Subject<void>();
  private sub: { unsubscribe(): void }[] = [];

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService,
    private readonly route: ActivatedRoute
  ) {}

  get canCreate(): boolean { return this.perms.hasPermission('students:create'); }
  get canUpdate(): boolean { return this.perms.hasPermission('students:update'); }
  get canExport(): boolean { return this.perms.hasPermission('reports:export') && this.perms.hasPermission('students:read'); }
  get canResetLogins(): boolean { return this.perms.hasPermission('users:update'); }
  get canManage(): boolean { return this.canUpdate; }
  get canSeeMedical(): boolean { return this.perms.isRole('super_admin', 'admin', 'principal', 'parent', 'student') || this.perms.hasPermission('health-records:read'); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  money(v: unknown): string { return formatMoney(v); }

  ngOnInit(): void {
    this.sub.push(this.searchInput$.pipe(debounceTime(300)).subscribe(() => this.reload()));
    this.api.get<any[]>('/classes', { limit: 200 }).subscribe({ next: (r) => (this.classes = r?.data ?? []), error: () => {} });
    this.api.get<any[]>('/sections', { limit: 500 }).subscribe({ next: (r) => (this.sections = r?.data ?? []), error: () => {} });
    this.load();
    // Deep link from Admissions -> "View student".
    const open = Number(this.route.snapshot.queryParamMap.get('open'));
    if (Number.isInteger(open) && open > 0) this.openProfile(open);
  }
  ngOnDestroy(): void { this.sub.forEach((s) => s.unsubscribe()); }

  sectionsOf(classId: number | null): any[] { return classId ? this.sections.filter((s) => Number(s.classId) === Number(classId)) : []; }
  private className(id: unknown): string { return this.classes.find((c) => Number(c.id) === Number(id))?.name ?? ''; }
  private sectionName(id: unknown): string { return this.sections.find((s) => Number(s.id) === Number(id))?.name ?? ''; }
  classLabel(s: any): string {
    const c = this.className(s.currentClassId);
    const sec = this.sectionName(s.currentSectionId);
    return c ? (sec ? `${c} · ${sec}` : c) : '—';
  }
  rollOf(s: any): string {
    const e = (s.enrolments ?? []).filter((x: any) => x.status === 'active').sort((a: any, b: any) => Number(b.id) - Number(a.id))[0];
    return e?.rollNo ?? '—';
  }

  setTab(t: 'active' | 'inactive'): void { this.tab = t; this.reload(); }
  reload(): void { this.page = 1; this.load(); }
  setPage(p: number): void { this.page = p; this.load(); }

  load(): void {
    this.loading = true;
    if (this.tab === 'inactive') {
      this.api.get<any[]>('/students/inactive').subscribe({
        next: (r) => {
          const q = this.search.trim().toLowerCase();
          this.rows = (r?.data ?? []).filter((s) => !q || `${s.firstName} ${s.lastName} ${s.admissionNo}`.toLowerCase().includes(q));
          this.total = this.rows.length;
          this.loading = false;
        },
        error: () => (this.loading = false),
      });
      return;
    }
    const params: Record<string, unknown> = { page: this.page, limit: this.limit };
    if (this.search.trim()) params['q'] = this.search.trim();
    if (this.classFilter) params['filter[currentClassId]'] = this.classFilter;
    if (this.sectionFilter) params['filter[currentSectionId]'] = this.sectionFilter;
    this.api.get<any[]>('/students', params).subscribe({
      next: (r) => { this.rows = r?.data ?? []; this.total = r?.meta?.total ?? this.rows.length; this.loading = false; },
      error: () => (this.loading = false),
    });
  }

  exportCsv(): void {
    const q = new URLSearchParams();
    if (this.search.trim()) q.set('q', this.search.trim());
    if (this.classFilter) q.set('filter[currentClassId]', this.classFilter);
    this.api.download(`/students/export${q.toString() ? '?' + q : ''}`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `students-${this.today}.csv`; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {},
    });
  }

  // ---------------------------------------------------------------- add / edit
  openCreate(): void {
    this.editingId = null;
    this.form = blankForm();
    this.form.currentClassId = this.classFilter ? Number(this.classFilter) : null;
    this.guardians = [{ fullName: '', relation: 'father', phone: '', email: '' }];
    this.formError = '';
    this.showForm = true;
  }

  openEdit(s: any): void {
    this.editingId = Number(s.id);
    const e = (s.enrolments ?? []).filter((x: any) => x.status === 'active').sort((a: any, b: any) => Number(b.id) - Number(a.id))[0];
    this.form = {
      firstName: s.firstName ?? '', lastName: s.lastName ?? '', gender: s.gender ?? '', dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : '',
      currentClassId: s.currentClassId != null ? Number(s.currentClassId) : null, currentSectionId: s.currentSectionId != null ? Number(s.currentSectionId) : null,
      rollNo: e?.rollNo ?? '', admissionDate: s.admissionDate ? String(s.admissionDate).slice(0, 10) : '', bloodGroup: s.bloodGroup ?? '', religion: s.religion ?? '',
      nationality: s.nationality ?? '', email: s.email ?? '', emergencyContact: s.emergencyContact ?? '', address: s.address ?? '',
      medicalNotes: (s.medicalInfo as any)?.notes ?? '',
    };
    this.formError = '';
    this.showForm = true;
  }

  editFromProfile(): void {
    const id = this.profile?.student?.id;
    this.profile = null;
    if (!id) return;
    this.api.get<any>(`/students/${id}`).subscribe({ next: (r) => r?.data && this.openEdit(r.data), error: () => {} });
  }

  addGuardian(): void { this.guardians.push({ fullName: '', relation: 'mother', phone: '', email: '' }); }

  /** Tell the clerk, before saving, that this phone number already belongs to a registered parent. */
  lookupGuardian(g: GuardianRow): void {
    g.known = '';
    const digits = g.phone.replace(/\D/g, '');
    if (digits.length < 7) return;
    this.api.get<any[]>('/parents', { q: g.phone.trim(), limit: 5 }).subscribe({
      next: (r) => {
        const hit = (r?.data ?? []).find((p) => String(p.phone ?? '').replace(/\D/g, '') === digits && (!g.fullName.trim() || String(p.fullName).trim().toLowerCase() === g.fullName.trim().toLowerCase()));
        if (hit) { g.known = hit.fullName; if (!g.fullName.trim()) g.fullName = hit.fullName; }
      },
      error: () => {},
    });
  }

  save(): void {
    this.formError = '';
    const f = this.form;
    if (!f.firstName.trim() || !f.gender || !f.currentClassId) { this.formError = 'Please fill the required fields: first name, gender and class.'; return; }
    if (f.dateOfBirth && f.dateOfBirth > this.today) { this.formError = 'Date of birth cannot be in the future.'; return; }
    const body: Record<string, unknown> = {
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), gender: f.gender, dateOfBirth: f.dateOfBirth || null,
      currentClassId: f.currentClassId, currentSectionId: f.currentSectionId, bloodGroup: f.bloodGroup.trim(), religion: f.religion.trim(),
      nationality: f.nationality.trim(), emergencyContact: f.emergencyContact.trim(), email: f.email.trim(), address: f.address.trim(),
      admissionDate: f.admissionDate || undefined,
    };
    if (f.rollNo.trim()) body['rollNo'] = f.rollNo.trim();
    if (this.canSeeMedical) body['medicalInfo'] = f.medicalNotes.trim() ? { notes: f.medicalNotes.trim() } : null;

    this.saving = true;
    if (this.editingId) {
      this.api.put(`/students/${this.editingId}`, body).subscribe({
        next: () => { this.saving = false; this.showForm = false; this.toasts.success('Student updated'); this.load(); },
        error: (err) => { this.saving = false; this.formError = err?.error?.message || 'Could not save the student'; },
      });
      return;
    }
    const gs = this.guardians.filter((g) => g.fullName.trim() || g.phone.trim());
    body['guardians'] = gs.map((g) => ({ fullName: g.fullName.trim(), relation: g.relation, phone: g.phone.trim(), email: g.email.trim() }));
    this.api.post<any>('/students', body).subscribe({
      next: (r) => {
        this.saving = false;
        this.showForm = false;
        this.toasts.success(`${f.firstName} admitted (${r?.data?.admissionNo ?? ''})`);
        this.load();
        const creds: LoginCredential[] = r?.data?.credentials ?? [];
        if (creds.length) this.issued = { title: `Logins for ${f.firstName} ${f.lastName}`.trim(), credentials: creds };
      },
      error: (err) => { this.saving = false; this.formError = err?.error?.message || 'Could not admit the student'; },
    });
  }

  // ---------------------------------------------------------------- profile / lifecycle
  openProfile(id: number): void {
    this.api.get<any>(`/students/${id}/profile`).subscribe({ next: (r) => (this.profile = r?.data ?? null), error: () => {} });
  }

  askDeactivate(s: any): void { this.confirmDeactivate = s; }
  deactivate(): void {
    const s = this.confirmDeactivate;
    this.confirmDeactivate = null;
    if (!s) return;
    this.api.delete(`/students/${s.id}`).subscribe({ next: () => { this.toasts.success(`${s.firstName} deactivated`); this.load(); }, error: () => {} });
  }
  reactivate(s: any): void {
    this.api.patch(`/students/${s.id}/reactivate`, {}).subscribe({ next: () => { this.toasts.success(`${s.firstName} reactivated`); this.load(); }, error: () => {} });
  }

  resetLogins(): void {
    const p = this.profile;
    this.confirmReset = false;
    if (!p) return;
    this.api.post<any>(`/students/${p.student.id}/reset-logins`, {}).subscribe({
      next: (r) => { this.issued = { title: `New logins for ${p.student.firstName}`, credentials: r?.data?.credentials ?? [] }; },
      error: () => {},
    });
  }
}
