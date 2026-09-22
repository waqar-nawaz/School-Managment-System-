import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface RegisterEntry {
  studentId: number;
  rollNo: string | null;
  status: string | null;
  lateMinutes: number;
  reason: string;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Attendance</h1>
        <p class="page-subtitle">Mark daily attendance per class</p>
      </div>
    </div>

    <div class="card">
      <div class="card-toolbar">
        <input type="number" class="form-control" style="max-width:140px" placeholder="Class ID" [(ngModel)]="classId" />
        <input type="number" class="form-control" style="max-width:140px" placeholder="Section ID (opt)" [(ngModel)]="sectionId" />
        <input type="date" class="form-control" style="max-width:170px" [(ngModel)]="date" />
        <button class="btn btn-primary" (click)="loadRegister()"><app-icon name="search" [size]="15" /> Load register</button>
      </div>

      @if (entries.length) {
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr><th>Roll</th><th>Student ID</th><th>Status</th><th>Late (min)</th><th>Reason</th></tr>
            </thead>
            <tbody>
              @for (e of entries; track e.studentId) {
                <tr>
                  <td>{{ e.rollNo ?? '—' }}</td>
                  <td>{{ e.studentId }}</td>
                  <td>
                    <select class="form-control form-control-sm" [(ngModel)]="e.status">
                      @for (s of STATUSES; track s) { <option [value]="s">{{ s }}</option> }
                    </select>
                  </td>
                  <td><input type="number" class="form-control form-control-sm" style="width:80px" [(ngModel)]="e.lateMinutes" /></td>
                  <td><input class="form-control form-control-sm" style="width:220px" [(ngModel)]="e.reason" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="modal-actions" style="justify-content:flex-start">
          <button class="btn btn-primary" [disabled]="saving" (click)="save()">
            <app-icon name="check" [size]="15" /> {{ saving ? 'Saving…' : 'Save attendance' }}
          </button>
          <button class="btn btn-ghost" (click)="markAll('present')"><app-icon name="check" [size]="15" /> All present</button>
          <button class="btn btn-ghost" (click)="markAll('absent')"><app-icon name="x" [size]="15" /> All absent</button>
        </div>
      } @else {
        <p class="form-hint">Choose a class and date, then load the register.</p>
      }
    </div>
  `,
})
export class AttendanceComponent implements OnInit {
  readonly STATUSES = ['present', 'absent', 'late', 'leave'];
  classId = 1;
  sectionId: number | null = null;
  date = new Date().toISOString().slice(0, 10);
  entries: RegisterEntry[] = [];
  saving = false;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.loadRegister();
  }

  loadRegister(): void {
    if (!this.classId) return;
    const params: Record<string, unknown> = { classId: this.classId, date: this.date };
    if (this.sectionId) params.sectionId = this.sectionId;
    this.api.get<{ register: RegisterEntry[] }>('/attendance/register', params).subscribe({
      next: (res) => (this.entries = res?.data?.register ?? []),
      error: () => {},
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
    this.api.post('/attendance/bulk', { classId: this.classId, ...(this.sectionId ? { sectionId: this.sectionId } : {}), entries }).subscribe({
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