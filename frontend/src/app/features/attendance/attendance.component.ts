import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface RegisterEntry {
  studentId: number;
  studentName?: string;
  admissionNo?: string;
  rollNo: string | null;
  status: string | null;
  lateMinutes: number;
  reason: string;
}

interface ClassOption {
  id: number;
  name: string;
}
interface SectionOption {
  id: number;
  name: string;
  classId: number;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Attendance</h1>
        <p class="page-subtitle">{{ isStudent ? "View your own attendance" : "Select a class &amp; date, load the register, mark and save" }}</p>
      </div>
    </div>

    @if (isStudent) {
      <div class="card">
        <div class="card-toolbar">
          <input type="month" class="form-control" style="max-width:170px" [(ngModel)]="month" (ngModelChange)="loadMyAttendance()" />
        </div>
        @if (myAttendance.length) {
          <div class="table-responsive">
            <table class="table">
              <thead><tr><th>Date</th><th>Status</th><th>Late (min)</th><th>Reason</th></tr></thead>
              <tbody>
                @for (e of myAttendance; track e.date) {
                  <tr><td>{{ e.date }}</td><td>{{ e.status }}</td><td>{{ e.lateMinutes || 0 }}</td><td>{{ e.reason || "—" }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="form-hint">No attendance records found for this month.</p>
        }
      </div>
    }

    @if (!isStudent) {
    <div class="card">
      <div class="card-toolbar">
        <select class="form-control" style="max-width:200px" [(ngModel)]="classId" (ngModelChange)="onClassChange()">
          <option [ngValue]="null">— Select class —</option>
          @for (c of classes; track c.id) {
            <option [ngValue]="c.id">{{ c.name }}</option>
          }
        </select>
        <select class="form-control" style="max-width:200px" [(ngModel)]="sectionId">
          <option [ngValue]="null">All sections</option>
          @for (s of sections; track s.id) {
            <option [ngValue]="s.id">{{ s.name }}</option>
          }
        </select>
        <input type="date" class="form-control" style="max-width:170px" [(ngModel)]="date" />
        <button class="btn btn-primary" (click)="loadRegister()" [disabled]="!classId">
          <app-icon name="search" [size]="15" /> Load register
        </button>
      </div>

      @if (loading) {
        <p class="form-hint">Loading register…</p>
      }

      @if (errorState) {
        <p class="form-hint" style="color:var(--danger)">Failed to load register. Please try again.</p>
      }

      @if (!loading && !errorState && entries.length) {
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="width:70px">Roll</th>
                <th style="width:90px">Adm #</th>
                <th>Student</th>
                <th style="width:150px">Status</th>
                <th style="width:110px">Late (min)</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              @for (e of entries; track e.studentId) {
                <tr>
                  <td>{{ e.rollNo ?? '—' }}</td>
                  <td>{{ e.admissionNo || '—' }}</td>
                  <td>{{ e.studentName || ('#' + e.studentId) }}</td>
                  <td>
                    <select class="form-control form-control-sm" [(ngModel)]="e.status">
                      @for (s of STATUSES; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      style="width:80px"
                      [(ngModel)]="e.lateMinutes"
                      [disabled]="e.status !== 'late'"
                    />
                  </td>
                  <td>
                    <input
                      class="form-control form-control-sm"
                      [(ngModel)]="e.reason"
                      [disabled]="!['absent','late','excused'].includes(e.status || '')"
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (canMark) {
          <div class="modal-actions" style="justify-content:flex-start">
            <button class="btn btn-primary" [disabled]="saving || dateChanged" (click)="save()">
              <app-icon name="check" [size]="15" /> {{ saving ? 'Saving…' : 'Save attendance' }}
            </button>
            <button class="btn btn-ghost" (click)="markAll('present')"><app-icon name="check" [size]="15" /> All present</button>
            <button class="btn btn-ghost" (click)="markAll('absent')"><app-icon name="x" [size]="15" /> All absent</button>
            @if (dateChanged) {
              <span class="form-hint" style="color:var(--danger)">Date changed — click "Load register" to refresh</span>
            }
          </div>
        }
      } @else if (!loading && !errorState && loaded) {
        <p class="form-hint">No active students in this class/section. Enrol students first (Enrolments or add a student with a class).</p>
      } @else if (!loading && !errorState && !loaded) {
        <p class="form-hint">
          Choose the class (and section if needed) and the date, then click "Load register".
          The list shows the students enrolled in that class, defaulting to present — change anyone who is absent/late and save.
        </p>
      }
    </div>
    }
  `,
})
export class AttendanceComponent implements OnInit {
  readonly STATUSES = ['present', 'absent', 'late', 'excused', 'holiday'];
  classes: ClassOption[] = [];
  sections: SectionOption[] = [];
  classId: number | null = null;
  sectionId: number | null = null;
  // Local date — avoids UTC-vs-local timezone bug (e.g. UTC+5 saves yesterday between 00:00–05:00 PKT).
  date = new Date().toLocaleDateString('en-CA');
  loadedDate: string | null = null;
  entries: RegisterEntry[] = [];
  myAttendance: Array<{ id?: number; date: string; status: string; lateMinutes?: number; reason?: string }> = [];
  month = new Date().toLocaleDateString("en-CA").slice(0, 7);
  loaded = false;
  loading = false;
  errorState = false;
  saving = false;
  canMark = false;

  get isStudent(): boolean {
    return this.perms.isRole("student");
  }

  /** True when the user changed the date input after loading — prevents saving to the wrong date. */
  get dateChanged(): boolean {
    return this.loadedDate !== null && this.date !== this.loadedDate;
  }

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {
    this.canMark =
      this.perms.hasPermission('attendance:create') || this.perms.hasPermission('attendance:update');
  }

  ngOnInit(): void {
    if (this.isStudent) {
      this.loadMyAttendance();
      return;
    }
    this.api.get<ClassOption[]>('/classes', { page: 1, limit: 100 }).subscribe({
      next: (res) => (this.classes = (res?.data as ClassOption[]) ?? []),
      error: () => {},
    });
  }

  loadMyAttendance(): void {
    if (!this.isStudent) return;
    this.api.get<Array<{ id?: number; date: string; status: string; lateMinutes?: number; reason?: string }>>("/attendance/me", { month: this.month }).subscribe({
      next: (res) => (this.myAttendance = (res?.data as any[]) ?? []),
      error: () => (this.myAttendance = []),
    });
  }

  onClassChange(): void {
    this.sectionId = null;
    this.sections = [];
    this.entries = [];
    this.loaded = false;
    this.loadedDate = null;
    this.errorState = false;
    if (this.classId) {
      this.api
        .get<SectionOption[]>('/sections', { 'filter[classId]': this.classId, page: 1, limit: 100 })
        .subscribe({
          next: (res) => (this.sections = (res?.data as SectionOption[]) ?? []),
          error: () => {},
        });
    }
  }

  loadRegister(): void {
    if (!this.classId) return;
    this.loading = true;
    this.errorState = false;
    const params: Record<string, unknown> = { classId: this.classId, date: this.date };
    if (this.sectionId) params.sectionId = this.sectionId;
    this.api.get<{ register: RegisterEntry[] }>('/attendance/register', params).subscribe({
      next: (res) => {
        this.entries = (res?.data?.register ?? []).map((e) => ({
          ...e,
          status: e.status || 'present',
        }));
        this.loaded = true;
        this.loadedDate = this.date;
        this.loading = false;
      },
      error: () => {
        this.entries = [];
        this.loaded = true;
        this.errorState = true;
        this.loading = false;
      },
    });
  }

  markAll(status: string): void {
    for (const e of this.entries) e.status = status;
  }

  save(): void {
    // Guard: if the user changed the date after loading, don't save — they'd be
    // writing date-X entries under date Y.
    if (this.dateChanged) {
      this.toasts.error('Date changed — click "Load register" to refresh first');
      return;
    }
    this.saving = true;
    const entries = this.entries.map((e) => ({
      studentId: e.studentId,
      status: e.status || 'present',
      lateMinutes: e.lateMinutes,
      reason: e.reason,
    }));
    this.api
      .post('/attendance/bulk', {
        classId: this.classId,
        ...(this.sectionId ? { sectionId: this.sectionId } : {}),
        date: this.date,
        entries,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.toasts.success('Attendance saved');
          this.loadRegister();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(err?.error?.message || 'Could not save attendance');
        },
      });
  }
}
