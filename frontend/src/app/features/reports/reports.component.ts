import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatMoney } from '../../core/utils/currency';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Reports</h1>
        <p class="page-subtitle">Analytics at a glance</p>
      </div>
    </div>

    <div class="report-tabs">
      @for (tab of tabs; track tab.key) {
        <button class="btn btn-sm {{ active === tab.key ? 'btn-primary' : 'btn-ghost' }}" (click)="switchTo(tab.key)">{{ tab.label }}</button>
      }
    </div>

    <div class="card">
      @if (active === 'byclass') {
        <h3 class="card-title">Enrolments by class</h3>
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Class</th><th>Students</th></tr></thead>
            <tbody>
              @for (r of byClass; track $index) {
                <tr><td>{{ r?.class?.name ?? r.classId }}</td><td>{{ r?.count }}</td></tr>
              } @empty { <tr><td colspan="2" class="empty-cell">{{ loading ? 'Loading…' : 'No data.' }}</td></tr> }
            </tbody>
          </table>
        </div>
      }
      @if (active === 'attendance') {
        <h3 class="card-title">Attendance rate</h3>
        <div class="form-row" style="gap:8px;margin-bottom:1rem">
          <label>From <input type="date" class="form-control" style="max-width:180px" [(ngModel)]="dateFrom" (ngModelChange)="loadActive()" /></label>
          <label>To <input type="date" class="form-control" style="max-width:180px" [(ngModel)]="dateTo" (ngModelChange)="loadActive()" /></label>
        </div>
        <p><span class="stat-value">{{ ar?.rate ?? 0 }}%</span> <span class="form-hint">({{ ar?.present ?? 0 }} present of {{ ar?.total ?? 0 }})</span></p>
      }
      @if (active === 'fees') {
        <h3 class="card-title">Fees summary</h3>
        <div class="form-row" style="gap:8px;margin-bottom:1rem">
          <label>From <input type="date" class="form-control" style="max-width:180px" [(ngModel)]="dateFrom" (ngModelChange)="loadActive()" /></label>
          <label>To <input type="date" class="form-control" style="max-width:180px" [(ngModel)]="dateTo" (ngModelChange)="loadActive()" /></label>
        </div>
        <div class="stat-grid stat-grid-sm">
          <div class="mini-card"><span class="stat-label">Invoiced</span><span class="stat-value">{{ money(fees?.invoiced) }}</span></div>
          <div class="mini-card"><span class="stat-label">Collected</span><span class="stat-value">{{ money(fees?.collected) }}</span></div>
          <div class="mini-card"><span class="stat-label">Refunded</span><span class="stat-value">{{ money(fees?.refunded) }}</span></div>
          <div class="mini-card"><span class="stat-label">Net received</span><span class="stat-value stat-ok">{{ money(fees?.net ?? ((fees?.collected ?? 0) - (fees?.refunded ?? 0))) }}</span></div>
          <div class="mini-card"><span class="stat-label">Outstanding</span><span class="stat-value stat-warn">{{ money(fees?.outstanding) }}</span></div>
          <div class="mini-card"><span class="stat-label">Spent</span><span class="stat-value">{{ money(fees?.spent) }}</span></div>
        </div>
      }
      @if (active === 'exam') {
        <h3 class="card-title">Exam performance</h3>
        <div class="form-row" style="gap:8px">
          <select class="form-control" style="max-width:320px" [(ngModel)]="examId" (ngModelChange)="loadExam()">
            <option [ngValue]="null">Choose an exam…</option>
            @for (e of exams; track e.id) { <option [ngValue]="e.id">{{ e.name || e.title || ('Exam #' + e.id) }}</option> }
          </select>
        </div>
        @if (!examId) {
          <p class="form-hint" style="margin-top:0.75rem">{{ exams.length ? 'Choose an exam to see its results.' : 'No exams found yet. Create an exam first.' }}</p>
        }
        @if (perf) {
          <div class="stat-grid stat-grid-sm">
            <div class="mini-card"><span class="stat-label">Average</span><span class="stat-value">{{ round(perf.average) }}</span></div>
            <div class="mini-card"><span class="stat-label">Highest</span><span class="stat-value">{{ perf.highest }}</span></div>
            <div class="mini-card"><span class="stat-label">Lowest</span><span class="stat-value">{{ perf.lowest }}</span></div>
            <div class="mini-card"><span class="stat-label">Students</span><span class="stat-value">{{ perf.totalStudents }}</span></div>
          </div>
        }
      }
      @if (active === 'snapshot') {
        <h3 class="card-title">Snapshot & ratios</h3>
        <div class="stat-grid stat-grid-sm">
          <div class="mini-card"><span class="stat-label">Students</span><span class="stat-value">{{ snap?.students }}</span></div>
          <div class="mini-card"><span class="stat-label">Teachers</span><span class="stat-value">{{ snap?.teachers }}</span></div>
          <div class="mini-card"><span class="stat-label">Staff</span><span class="stat-value">{{ snap?.staff }}</span></div>
          <div class="mini-card"><span class="stat-label">Student:Teacher</span><span class="stat-value">{{ snap?.ratio }}</span></div>
          <div class="mini-card"><span class="stat-label">Collected</span><span class="stat-value">{{ money(snap?.collected) }}</span></div>
          <div class="mini-card"><span class="stat-label">Pending Invoices</span><span class="stat-value">{{ snap?.pendingInvoices }}</span></div>
        </div>
      }
    </div>
  `,
})
export class ReportsComponent implements OnInit {
  readonly tabs = [
    { key: 'byclass', label: 'By Class' },
    { key: 'attendance', label: 'Attendance Rate' },
    { key: 'fees', label: 'Fees' },
    { key: 'exam', label: 'Exam Performance' },
    { key: 'snapshot', label: 'Snapshot' },
  ];
  active = 'byclass';
  byClass: any[] = [];
  ar: any = null;
  fees: any = null;
  perf: any = null;
  snap: any = null;
  examId: number | null = null;
  exams: any[] = [];
  dateFrom = '';
  dateTo = '';
  loading = false;

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.loadActive();
  }

  switchTo(key: string): void {
    this.active = key;
    if (key === 'exam' && !this.exams.length) {
      this.api.get<any[]>('/exams', { limit: 200 }).subscribe({ next: (r) => (this.exams = r?.data ?? []), error: () => {} });
    }
    if (key !== 'exam') this.loadActive();
  }

  private dateParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.dateFrom) params['from'] = this.dateFrom;
    if (this.dateTo) params['to'] = this.dateTo;
    return params;
  }

  loadActive(): void {
    this.loading = true;
    const params = this.dateParams();
    if (this.active === 'byclass') {
      this.api.get<any[]>('/reports/students-by-class').subscribe({ next: (r) => { this.byClass = r?.data ?? []; this.loading = false; }, error: () => { this.loading = false; } });
    }
    if (this.active === 'attendance') {
      this.api.get<any>('/reports/attendance-rate', params).subscribe({ next: (r) => { this.ar = r?.data; this.loading = false; }, error: () => { this.loading = false; } });
    }
    if (this.active === 'fees') {
      this.api.get<any>('/reports/fees', params).subscribe({ next: (r) => { this.fees = r?.data; this.loading = false; }, error: () => { this.loading = false; } });
    }
    if (this.active === 'snapshot') {
      this.api.get<any>('/reports/comparison').subscribe({ next: (r) => { this.snap = r?.data; this.loading = false; }, error: () => { this.loading = false; } });
    }
  }

  loadExam(): void {
    if (!this.examId || this.examId <= 0) {
      this.perf = null;
      return;
    }
    this.api.get<any>('/reports/exam-performance', { examId: this.examId }).subscribe({ next: (r) => (this.perf = r?.data), error: () => {} });
  }

  money(v: unknown): string {
    return formatMoney(v);
  }

  round(n: unknown): string {
    const x = Number(n ?? 0);
    return Number.isInteger(x) ? String(x) : x.toFixed(2);
  }
}
