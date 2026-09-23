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
        <p class="page-subtitle">Select a class &amp; date, load the register, mark and save</p>
      </div>
    </div>

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

      @if (entries.length) {
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="width:70px">Roll</th>
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
                  <td>{{ e.studentName || ('#' + e.studentId) }}</td>
                  <td>
                    <select class="form-control form-control-sm" [(ngModel)]="e.status">
                      @for (s of STATUSES; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                  </td>
                  <td><input type="number" class="form-control form-control-sm" style="width:80px" [(ngModel)]="e.lateMinutes" /></td>
                  <td><input class="form-control form-control-sm" [(ngModel)]="e.reason" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (canMark) {
          <div class="modal-actions" style="justify-content:flex-start">
            <button class="btn btn-primary" [disabled]="saving" (click)="save()">
              <app-icon name="check" [size]="15" /> {{ saving ? 'Saving…' : 'Save attendance' }}
            </button>
            <button class="btn btn-ghost" (click)="markAll('present')"><app-icon name="check" [size]="15" /> All present</button>
            <button class="btn btn-ghost" (click)="markAll('absent')"><app-icon name="x" [size]="15" /> All absent</button>
          </div>
        }
      } @else if (loaded) {
        <p class="form-hint">No active students in this class/section. Enrol students first (Enrolments or add a student with a class).</p>
      } @else {
        <p class="form-hint">
          Choose the class (and section if needed) and the date, then click “Load register”.
          The list shows the students enrolled in that class, defaulting to present — change anyone who is absent/late and save.
        </p>
      }
    </div>
  `,
})
export class AttendanceComponent implements OnInit {
  readonly STATUSES = ['present', 'absent', 'late', 'excused', 'holiday'];
  classes: ClassOption[] = [];
  sections: SectionOption[] = [];
  classId: number | null = null;
  sectionId: number | null = null;
  date = new Date().toISOString().slice(0, 10);
  entries: RegisterEntry[] = [];
  loaded = false;
  saving = false;
  canMark = false;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {
    this.canMark =
      this.perms.hasPermission('attendance:create') || this.perms.hasPermission('attendance:update');
  }

  ngOnInit(): void {
    this.api.get<ClassOption[]>('/classes', { page: 1, limit: 100 }).subscribe({
      next: (res) => (this.classes = (res?.data as ClassOption[]) ?? []),
      error: () => {},
    });
  }

  onClassChange(): void {
    this.sectionId = null;
    this.sections = [];
    this.entries = [];
    this.loaded = false;
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
    const params: Record<string, unknown> = { classId: this.classId, date: this.date };
    if (this.sectionId) params.sectionId = this.sectionId;
    this.api.get<{ register: RegisterEntry[] }>('/attendance/register', params).subscribe({
      next: (res) => {
        this.entries = (res?.data?.register ?? []).map((e) => ({
          ...e,
          status: e.status || 'present',
        }));
        this.loaded = true;
      },
      error: () => {
        this.entries = [];
        this.loaded = true;
      },
    });
  }

  markAll(status: string): void {
    for (const e of this.entries) e.status = status;
  }

  save(): void {
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
        error: () => {
          this.saving = false;
        },
      });
  }
}
