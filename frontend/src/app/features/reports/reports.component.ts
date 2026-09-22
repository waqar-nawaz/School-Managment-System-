import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule],
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
              } @empty { <tr><td colspan="2" class="empty-cell">No data.</td></tr> }
            </tbody>
          </table>
        </div>
      }
      @if (active === 'attendance') {
        <h3 class="card-title">Attendance rate</h3>
        <p><span class="stat-value">{{ ar?.rate ?? 0 }}%</span> <span class="form-hint">({{ ar?.present ?? 0 }} present of {{ ar?.total ?? 0 }})</span></p>
      }
      @if (active === 'fees') {
        <h3 class="card-title">Fees summary</h3>
        <div class="stat-grid stat-grid-sm">
          <div class="mini-card"><span class="stat-label">Invoiced</span><span class="stat-value">{{ money(fees?.invoiced) }}</span></div>
          <div class="mini-card"><span class="stat-label">Collected</span><span class="stat-value">{{ money(fees?.collected) }}</span></div>
          <div class="mini-card"><span class="stat-label">Outstanding</span><span class="stat-value stat-warn">{{ money(fees?.outstanding) }}</span></div>
          <div class="mini-card"><span class="stat-label">Spent</span><span class="stat-value">{{ money(fees?.spent) }}</span></div>
        </div>
      }
      @if (active === 'exam') {
        <h3 class="card-title">Exam performance</h3>
        <div class="form-row" style="gap:8px">
          <input type="number" class="form-control" style="max-width:160px" placeholder="Exam ID" [(ngModel)]="examId" />
          <button class="btn btn-primary" (click)="loadExam()">Run</button>
        </div>
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

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.loadAll();
  }

  switchTo(key: string): void {
    this.active = key;
    if (key !== 'exam') this.loadActive();
  }

  loadAll(): void {
    this.api.get<any[]>('/reports/students-by-class').subscribe((r) => (this.byClass = r?.data ?? []));
    this.api.get<any>('/reports/attendance-rate').subscribe((r) => (this.ar = r?.data));
    this.api.get<any>('/reports/fees').subscribe((r) => (this.fees = r?.data));
    this.api.get<any>('/reports/comparison').subscribe((r) => (this.snap = r?.data));
  }

  loadActive(): void {
    if (this.active === 'byclass') this.api.get<any[]>('/reports/students-by-class').subscribe((r) => (this.byClass = r?.data ?? []));
    if (this.active === 'attendance') this.api.get<any>('/reports/attendance-rate').subscribe((r) => (this.ar = r?.data));
    if (this.active === 'fees') this.api.get<any>('/reports/fees').subscribe((r) => (this.fees = r?.data));
    if (this.active === 'snapshot') this.api.get<any>('/reports/comparison').subscribe((r) => (this.snap = r?.data));
  }

  loadExam(): void {
    if (!this.examId) return;
    this.api.get<any>('/reports/exam-performance', { examId: this.examId }).subscribe((r) => (this.perf = r?.data));
  }

  money(v: unknown): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(Number(v ?? 0));
  }

  round(n: unknown): string {
    const x = Number(n ?? 0);
    return Number.isInteger(x) ? String(x) : x.toFixed(2);
  }
}