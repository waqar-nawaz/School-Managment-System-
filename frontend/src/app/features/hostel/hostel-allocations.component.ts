import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { formatMoney } from '../../core/utils/currency';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface Bed { id: number; bedNo: string; roomId: number; roomNo: string; hostelId: number; hostelName: string; hostelGender: string }
interface HostelRow { id: number; name: string; gender: string; isActive?: boolean }
interface StudentRow { id: number; firstName: string; lastName: string; admissionNo?: string; gender?: string }

type Dialog = null | 'allocate' | 'transfer' | 'checkout';

/** Allocate a bed, check a student out, or transfer them. Beds can only be picked from what is really free. */
@Component({
  selector: 'app-hostel-allocations',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Hostel Allocations</h1>
        <p class="page-subtitle">Who lives where. Beds are marked occupied/free automatically.</p>
      </div>
      <div class="page-actions">
        @if (canCreate) {
          <button class="btn btn-primary" (click)="openAllocate()"><app-icon name="plus" [size]="15" /> Allocate bed</button>
        }
      </div>
    </div>

    <div class="summary-row">
      <div class="mini-card"><span class="stat-label">Students in hostel</span><span class="stat-value">{{ activeCount ?? '—' }}</span></div>
      <div class="mini-card"><span class="stat-label">Free beds</span><span class="stat-value stat-ok">{{ freeBeds ?? '—' }}</span></div>
    </div>

    <div class="card">
      <div class="card-toolbar">
        <div class="search-box">
          <input class="form-control" placeholder="Search student name or admission no…" [(ngModel)]="search" (ngModelChange)="searchInput$.next()" />
          @if (search) {
            <button type="button" class="search-clear" (click)="search = ''; reload()" aria-label="Clear search"><app-icon name="x" [size]="14" /></button>
          }
        </div>
        <select class="form-control" style="max-width:170px" [(ngModel)]="statusFilter" (ngModelChange)="reload()">
          <option value="">All statuses</option>
          <option value="active">Living now</option>
          <option value="checked_out">Checked out</option>
          <option value="transferred">Transferred</option>
        </select>
        <select class="form-control" style="max-width:190px" [(ngModel)]="hostelFilter" (ngModelChange)="reload()">
          <option value="">All hostels</option>
          @for (h of hostels; track h.id) { <option [value]="h.id">{{ h.name }}</option> }
        </select>
      </div>

      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>Student</th><th>Hostel</th><th>Room</th><th>Bed</th><th>Check-in</th><th>Check-out</th><th>Monthly fee</th><th>Status</th><th style="width:190px;text-align:right">Actions</th></tr>
          </thead>
          <tbody>
            @for (a of rows; track a.id) {
              <tr>
                <td>{{ a.studentName || ('#' + a.studentId) }}<div class="form-hint" style="margin:0">{{ a.admissionNo }}</div></td>
                <td>{{ a.hostelName }}</td>
                <td>{{ a.roomNo }}</td>
                <td>{{ a.bedNo }}</td>
                <td>{{ a.checkIn | date: 'MMM d, y' }}</td>
                <td>{{ a.checkOut ? (a.checkOut | date: 'MMM d, y') : '—' }}</td>
                <td>{{ money(a.monthlyFee) }}</td>
                <td><span class="badge badge-{{ badge(a.status) }}">{{ label(a.status) }}</span></td>
                <td style="text-align:right;white-space:nowrap">
                  @if (a.status === 'active' && canUpdate) {
                    <button class="btn btn-sm btn-ghost" (click)="openTransfer(a)"><app-icon name="refresh" [size]="14" /> Transfer</button>
                    <button class="btn btn-sm btn-primary" (click)="openCheckout(a)"><app-icon name="log-out" [size]="14" /> Check out</button>
                  }
                  @if (canDelete) {
                    <button class="btn btn-sm btn-ghost" (click)="confirmDelete = a" aria-label="Delete"><app-icon name="trash" [size]="14" /></button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty-cell">{{ loading ? 'Loading…' : (search || statusFilter || hostelFilter ? 'No allocations match your filters.' : 'No allocations yet. Click “Allocate bed” to place a student.') }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (rows.length || total > 0) {
        <div class="pagination-bar">
          <span>{{ total }} record(s) — page {{ page }} of {{ totalPages }}</span>
          <div>
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="setPage(page - 1)"><app-icon name="chevron-left" [size]="14" /></button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="setPage(page + 1)"><app-icon name="chevron-right" [size]="14" /></button>
          </div>
        </div>
      }
    </div>

    @if (dialog === 'allocate' || dialog === 'transfer') {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">{{ dialog === 'allocate' ? 'Allocate a bed' : 'Transfer ' + (target?.studentName || 'student') }}</div>
            <button type="button" class="modal-close" (click)="closeDialog()" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>

          @if (dialog === 'transfer' && target) {
            <p class="page-subtitle" style="margin:0 0 1rem">
              Currently in <strong>{{ target.hostelName }} · Room {{ target.roomNo }} · Bed {{ target.bedNo }}</strong>.
              The old stay is kept in the history as “transferred”.
            </p>
          }

          <div class="form-grid">
            @if (dialog === 'allocate') {
              <div class="form-group" style="grid-column:1/-1">
                <label>Student *</label>
                @if (student) {
                  <div class="pick-chip">
                    <span>{{ student.firstName }} {{ student.lastName }} <small>{{ student.admissionNo }} · {{ student.gender || 'gender not set' }}</small></span>
                    <button type="button" class="btn btn-sm btn-ghost" (click)="clearStudent()">Change</button>
                  </div>
                } @else {
                  <input class="form-control" placeholder="Type a name or admission number…" [(ngModel)]="studentQuery" (ngModelChange)="studentInput$.next()" name="sq" autocomplete="off" />
                  @if (studentResults.length) {
                    <div class="pick-list">
                      @for (s of studentResults; track s.id) {
                        <button type="button" class="pick-item" [disabled]="activeStudentIds.has(s.id)" (click)="chooseStudent(s)">
                          {{ s.firstName }} {{ s.lastName }} <small>{{ s.admissionNo }} · {{ s.gender || '—' }}</small>
                          @if (activeStudentIds.has(s.id)) { <em>already has a bed</em> }
                        </button>
                      }
                    </div>
                  } @else if (studentQuery.trim().length >= 2 && !studentLoading) {
                    <div class="form-hint">No students found.</div>
                  }
                }
              </div>
            }

            <div class="form-group">
              <label>Hostel *</label>
              <select class="form-control" [(ngModel)]="hostelId" (ngModelChange)="roomId = null; bedId = null" name="hostel" [disabled]="!studentGender">
                <option [ngValue]="null">{{ studentGender ? 'Choose a hostel…' : 'Pick the student first' }}</option>
                @for (h of fittingHostels(); track h.id) { <option [ngValue]="h.id">{{ h.name }} ({{ h.gender }}) — {{ freeIn(h.id) }} free</option> }
              </select>
            </div>
            <div class="form-group">
              <label>Room *</label>
              <select class="form-control" [(ngModel)]="roomId" (ngModelChange)="bedId = null" name="room" [disabled]="!hostelId">
                <option [ngValue]="null">Choose a room…</option>
                @for (r of roomsOf(hostelId); track r.id) { <option [ngValue]="r.id">Room {{ r.roomNo }} — {{ r.free }} free</option> }
              </select>
            </div>
            <div class="form-group">
              <label>Bed *</label>
              <select class="form-control" [(ngModel)]="bedId" name="bed" [disabled]="!roomId">
                <option [ngValue]="null">Choose a bed…</option>
                @for (b of bedsOf(roomId); track b.id) { <option [ngValue]="b.id">Bed {{ b.bedNo }}</option> }
              </select>
            </div>
            <div class="form-group">
              <label>{{ dialog === 'allocate' ? 'Check-in date' : 'Transfer date' }}</label>
              <input type="date" class="form-control" [(ngModel)]="date" [max]="today" name="date" />
            </div>
            <div class="form-group">
              <label>Monthly fee</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="fee" name="fee" [placeholder]="dialog === 'allocate' ? 'Leave empty for the default hostel fee' : 'Leave empty to keep the current fee'" />
            </div>
          </div>

          @if (studentGender && !fittingHostels().length) {
            <div class="field-error">No hostel with free beds is available for this student.</div>
          }
          @if (dialogError) { <div class="field-error" style="margin-top:.5rem">{{ dialogError }}</div> }

          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="closeDialog()">Cancel</button>
            <button class="btn btn-primary" [disabled]="saving || !bedId || (dialog === 'allocate' && !student)" (click)="submit()">
              <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : (dialog === 'allocate' ? 'Allocate' : 'Transfer') }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (dialog === 'checkout' && target) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">Check out {{ target.studentName }}</div>
            <button type="button" class="modal-close" (click)="closeDialog()" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <p class="page-subtitle" style="margin:0 0 1rem">Bed {{ target.bedNo }} in room {{ target.roomNo }} ({{ target.hostelName }}) will be released.</p>
          <div class="form-group">
            <label>Check-out date</label>
            <input type="date" class="form-control" [(ngModel)]="date" [max]="today" name="outdate" />
          </div>
          @if (dialogError) { <div class="field-error">{{ dialogError }}</div> }
          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="closeDialog()">Cancel</button>
            <button class="btn btn-primary" [disabled]="saving" (click)="submit()"><app-icon name="log-out" [size]="14" /> {{ saving ? 'Saving…' : 'Check out' }}</button>
          </div>
        </div>
      </div>
    }

    @if (confirmDelete) {
      <app-confirm-dialog
        title="Delete this record?"
        [message]="confirmDelete.status === 'active' ? 'This student is still living here. Deleting the record will also free the bed. To keep the history use Check out instead.' : 'The history record will be removed permanently.'"
        confirmLabel="Delete"
        [danger]="true"
        (confirm)="doDelete()"
        (close)="confirmDelete = null" />
    }
  `,
  styles: [`
    .summary-row { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .pick-chip { display: flex; justify-content: space-between; align-items: center; gap: .5rem; padding: .5rem .75rem; border: 1px solid rgba(127,127,127,.35); border-radius: 8px; }
    .pick-list { border: 1px solid rgba(127,127,127,.35); border-radius: 8px; margin-top: .35rem; max-height: 220px; overflow: auto; }
    .pick-item { display: flex; gap: .5rem; align-items: baseline; width: 100%; padding: .5rem .75rem; border: 0; background: transparent; text-align: left; cursor: pointer; color: inherit; }
    .pick-item:hover:not(:disabled) { background: rgba(127,127,127,.12); }
    .pick-item:disabled { opacity: .5; cursor: not-allowed; }
    .pick-item small { opacity: .7; }
    .pick-item em { margin-left: auto; font-size: .8rem; }
  `],
})
export class HostelAllocationsComponent implements OnInit, OnDestroy {
  rows: any[] = [];
  total = 0;
  page = 1;
  readonly limit = 15;
  loading = false;
  search = '';
  statusFilter = '';
  hostelFilter = '';
  activeCount: number | null = null;
  freeBeds: number | null = null;

  hostels: HostelRow[] = [];
  beds: Bed[] = [];
  activeStudentIds = new Set<number>();

  dialog: Dialog = null;
  target: any = null;
  student: StudentRow | null = null;
  studentQuery = '';
  studentResults: StudentRow[] = [];
  studentLoading = false;
  hostelId: number | null = null;
  roomId: number | null = null;
  bedId: number | null = null;
  date = '';
  fee: number | null = null;
  saving = false;
  dialogError = '';
  confirmDelete: any = null;

  readonly today = new Date().toLocaleDateString('en-CA');
  readonly searchInput$ = new Subject<void>();
  readonly studentInput$ = new Subject<void>();
  private subs: Array<{ unsubscribe(): void }> = [];

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {}

  get canCreate(): boolean { return this.perms.hasPermission('hostel-allocations:create'); }
  get canUpdate(): boolean { return this.perms.hasPermission('hostel-allocations:update'); }
  get canDelete(): boolean { return this.perms.hasPermission('hostel-allocations:delete'); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  /** Gender of the person being placed (the student in the dialog, or the one being transferred). */
  get studentGender(): string {
    if (this.dialog === 'transfer') return this.target?.student?.gender ?? '';
    return this.student ? (this.student.gender ?? 'unknown') : '';
  }

  ngOnInit(): void {
    this.subs.push(this.searchInput$.pipe(debounceTime(300)).subscribe(() => this.reload()));
    this.subs.push(this.studentInput$.pipe(debounceTime(300)).subscribe(() => this.findStudents()));
    this.api.get<HostelRow[]>('/hostels', { limit: 200 }).subscribe({ next: (r) => (this.hostels = r?.data ?? []), error: () => {} });
    this.load();
    this.loadSummary();
  }
  ngOnDestroy(): void { this.subs.forEach((s) => s.unsubscribe()); }

  money(v: unknown): string { return formatMoney(v); }
  label(s: string): string { return s === 'active' ? 'living now' : String(s ?? '').replace(/_/g, ' '); }
  badge(s: string): string { return ({ active: 'success', checked_out: 'info', transferred: 'warning' } as Record<string, string>)[s] ?? ''; }

  reload(): void { this.page = 1; this.load(); }
  setPage(p: number): void { this.page = p; this.load(); }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.limit };
    if (this.search.trim()) params['q'] = this.search.trim();
    if (this.statusFilter) params['filter[status]'] = this.statusFilter;
    if (this.hostelFilter) params['filter[hostelId]'] = this.hostelFilter;
    this.api.get<any[]>('/hostel-allocations', params).subscribe({
      next: (r) => { this.rows = r?.data ?? []; this.total = r?.meta?.total ?? this.rows.length; this.loading = false; },
      error: () => (this.loading = false),
    });
  }

  loadSummary(): void {
    this.api.get<{ total: number }>('/hostel-allocations/count', { 'filter[status]': 'active' }).subscribe({ next: (r) => (this.activeCount = r?.data?.total ?? 0), error: () => {} });
    this.api.get<{ total: number }>('/beds/count', { 'filter[status]': 'available' }).subscribe({ next: (r) => (this.freeBeds = r?.data?.total ?? 0), error: () => {} });
  }

  // ---------------------------------------------------------------- bed picking (only free beds)
  private loadOptions(): void {
    this.api.get<{ beds: Bed[]; activeStudentIds: number[] }>('/hostel-allocations/options').subscribe({
      next: (r) => {
        this.beds = r?.data?.beds ?? [];
        this.activeStudentIds = new Set(r?.data?.activeStudentIds ?? []);
      },
      error: () => {},
    });
  }

  fittingHostels(): HostelRow[] {
    const g = this.studentGender;
    if (!g) return [];
    return this.hostels.filter((h) => h.isActive !== false && this.freeIn(h.id) > 0 &&
      (h.gender === 'coed' || (h.gender === 'boys' && g === 'male') || (h.gender === 'girls' && g === 'female')));
  }
  freeIn(hostelId: number): number { return this.beds.filter((b) => Number(b.hostelId) === Number(hostelId)).length; }
  roomsOf(hostelId: number | null): Array<{ id: number; roomNo: string; free: number }> {
    if (!hostelId) return [];
    const map = new Map<number, { id: number; roomNo: string; free: number }>();
    for (const b of this.beds) {
      if (Number(b.hostelId) !== Number(hostelId)) continue;
      const cur = map.get(b.roomId) ?? { id: b.roomId, roomNo: b.roomNo, free: 0 };
      cur.free += 1;
      map.set(b.roomId, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
  }
  bedsOf(roomId: number | null): Bed[] {
    return roomId ? this.beds.filter((b) => Number(b.roomId) === Number(roomId)) : [];
  }

  // ---------------------------------------------------------------- dialogs
  private resetDialog(): void {
    this.hostelId = this.roomId = this.bedId = null;
    this.fee = null;
    this.date = this.today;
    this.dialogError = '';
    this.saving = false;
  }
  closeDialog(): void { this.dialog = null; this.target = null; this.student = null; this.studentQuery = ''; this.studentResults = []; this.resetDialog(); }

  openAllocate(): void {
    this.resetDialog();
    this.student = null; this.studentQuery = ''; this.studentResults = [];
    this.dialog = 'allocate';
    this.loadOptions();
  }

  findStudents(): void {
    const q = this.studentQuery.trim();
    if (q.length < 2) { this.studentResults = []; return; }
    this.studentLoading = true;
    this.api.get<StudentRow[]>('/students', { q, limit: 15 }).subscribe({
      next: (r) => { this.studentResults = r?.data ?? []; this.studentLoading = false; },
      error: () => (this.studentLoading = false),
    });
  }
  chooseStudent(s: StudentRow): void { this.student = s; this.studentResults = []; this.hostelId = this.roomId = this.bedId = null; }
  clearStudent(): void { this.student = null; this.hostelId = this.roomId = this.bedId = null; }

  openTransfer(a: any): void {
    this.resetDialog();
    this.target = a;
    this.dialog = 'transfer';
    this.loadOptions();
  }
  openCheckout(a: any): void { this.resetDialog(); this.target = a; this.dialog = 'checkout'; }

  submit(): void {
    this.saving = true;
    this.dialogError = '';
    const fail = (err: any) => { this.saving = false; this.dialogError = err?.error?.message || 'Something went wrong. Please try again.'; };
    const done = (msg: string) => { this.toasts.success(msg); this.closeDialog(); this.load(); this.loadSummary(); };
    const fee = this.fee === null || (this.fee as unknown) === '' ? undefined : this.fee;

    if (this.dialog === 'allocate' && this.student) {
      this.api.post('/hostel-allocations', {
        studentId: this.student.id, hostelId: this.hostelId, roomId: this.roomId, bedId: this.bedId,
        checkIn: this.date || undefined, monthlyFee: fee,
      }).subscribe({ next: () => done(`${this.student?.firstName} was given a bed`), error: fail });
    } else if (this.dialog === 'transfer' && this.target) {
      this.api.post(`/hostel-allocations/${this.target.id}/transfer`, { bedId: this.bedId, transferDate: this.date || undefined, monthlyFee: fee })
        .subscribe({ next: () => done('Student transferred'), error: fail });
    } else if (this.dialog === 'checkout' && this.target) {
      this.api.post(`/hostel-allocations/${this.target.id}/checkout`, { checkOut: this.date || undefined })
        .subscribe({ next: () => done('Student checked out and bed released'), error: fail });
    }
  }

  doDelete(): void {
    const a = this.confirmDelete;
    this.confirmDelete = null;
    if (!a) return;
    this.api.delete(`/hostel-allocations/${a.id}`).subscribe({
      next: () => { this.toasts.success('Record deleted'); this.load(); this.loadSummary(); },
      error: () => {},
    });
  }
}
