import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatMoney } from '../../core/utils/currency';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface ReportTab {
  key: string;
  label: string;
  icon: string;
  description: string;
}

interface ByClassRow { classId: number; count: number; class?: { name?: string } }

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Reports</h1>
        <p class="page-subtitle">School performance, finances, and attendance at a glance.</p>
      </div>
    </div>

    <nav class="report-nav">
      @for (tab of tabs; track tab.key) {
        <button
          type="button"
          class="report-tab"
          [class.active]="active === tab.key"
          (click)="switchTo(tab.key)"
          [title]="tab.description">
          <span class="report-tab-icon"><app-icon [name]="tab.icon" [size]="17" /></span>
          <span class="report-tab-copy">
            <strong>{{ tab.label }}</strong>
            <small>{{ tab.description }}</small>
          </span>
        </button>
      }
    </nav>

    <div class="card">
      @if (loading) {
        <div class="report-skel">
          @for (i of [1,2,3,4]; track i) { <div class="report-tile-skel"></div> }
        </div>
      } @else {

        @if (active === 'byclass') {
          <header class="report-head">
            <div>
              <h2 class="report-title">Enrolments by class</h2>
              <p class="report-subtitle">Distribution of active students across classes.</p>
            </div>
            <div class="report-head-meta">
              <span class="report-meta-chip"><app-icon name="users" [size]="13" /> {{ totalEnrolments }} students</span>
              <span class="report-meta-chip"><app-icon name="layers" [size]="13" /> {{ byClass.length }} classes</span>
            </div>
          </header>
          @if (byClass.length) {
            <div class="bar-chart">
              @for (r of byClassSorted; track r.classId) {
                <div class="bar-row">
                  <div class="bar-label">{{ r?.class?.name ?? ('Class #' + r.classId) }}</div>
                  <div class="bar-track">
                    <div class="bar-fill" [style.width.%]="barPct(r.count)">
                      <span class="bar-value">{{ r.count }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="report-empty">
              <div class="report-empty-icon"><app-icon name="users" [size]="28" /></div>
              <strong>No enrolments yet</strong>
              <span>Admit students and they will appear here, grouped by their current class.</span>
            </div>
          }
        }

        @if (active === 'attendance') {
          <header class="report-head">
            <div>
              <h2 class="report-title">Attendance rate</h2>
              <p class="report-subtitle">Percentage of marked-present records over the selected date range.</p>
            </div>
            <div class="report-dates">
              <label class="report-date">
                <span>From</span>
                <input type="date" class="form-control" [(ngModel)]="dateFrom" (ngModelChange)="loadActive()" />
              </label>
              <label class="report-date">
                <span>To</span>
                <input type="date" class="form-control" [(ngModel)]="dateTo" (ngModelChange)="loadActive()" />
              </label>
            </div>
          </header>
          <div class="attendance-display">
            <div class="attendance-ring">
              <svg viewBox="0 0 120 120" class="ring-svg">
                <circle cx="60" cy="60" r="52" class="ring-bg" />
                <circle cx="60" cy="60" r="52" class="ring-fill" [style.stroke-dashoffset.px]="ringOffset(ar?.rate ?? 0)" />
              </svg>
              <div class="attendance-ring-value">
                <strong>{{ ar?.rate ?? 0 }}%</strong>
                <small>present</small>
              </div>
            </div>
            <div class="attendance-stats">
              <div class="attendance-stat">
                <span class="attendance-stat-icon attendance-stat-present"><app-icon name="check" [size]="16" /></span>
                <div><strong>{{ ar?.present ?? 0 }}</strong><small>Present records</small></div>
              </div>
              <div class="attendance-stat">
                <span class="attendance-stat-icon attendance-stat-total"><app-icon name="users" [size]="16" /></span>
                <div><strong>{{ ar?.total ?? 0 }}</strong><small>Total records</small></div>
              </div>
              <div class="attendance-stat">
                <span class="attendance-stat-icon attendance-stat-absent"><app-icon name="x" [size]="16" /></span>
                <div><strong>{{ (ar?.total ?? 0) - (ar?.present ?? 0) }}</strong><small>Absent / late</small></div>
              </div>
            </div>
          </div>
        }

        @if (active === 'fees') {
          <header class="report-head">
            <div>
              <h2 class="report-title">Fees summary</h2>
              <p class="report-subtitle">Money in vs money out over the selected date range.</p>
            </div>
            <div class="report-dates">
              <label class="report-date">
                <span>From</span>
                <input type="date" class="form-control" [(ngModel)]="dateFrom" (ngModelChange)="loadActive()" />
              </label>
              <label class="report-date">
                <span>To</span>
                <input type="date" class="form-control" [(ngModel)]="dateTo" (ngModelChange)="loadActive()" />
              </label>
            </div>
          </header>
          <div class="fees-grid">
            <div class="fee-tile fee-tile-in">
              <span class="fee-tile-icon"><app-icon name="trending-up" [size]="18" /></span>
              <div class="fee-tile-body"><strong>{{ money(fees?.collected) }}</strong><small>Collected</small></div>
            </div>
            <div class="fee-tile fee-tile-out">
              <span class="fee-tile-icon"><app-icon name="trending-down" [size]="18" /></span>
              <div class="fee-tile-body"><strong>{{ money(fees?.refunded) }}</strong><small>Refunded</small></div>
            </div>
            <div class="fee-tile fee-tile-net">
              <span class="fee-tile-icon"><app-icon name="dollar" [size]="18" /></span>
              <div class="fee-tile-body"><strong>{{ money(fees?.net ?? ((fees?.collected ?? 0) - (fees?.refunded ?? 0))) }}</strong><small>Net received</small></div>
            </div>
            <div class="fee-tile fee-tile-warn">
              <span class="fee-tile-icon"><app-icon name="alert" [size]="18" /></span>
              <div class="fee-tile-body"><strong>{{ money(fees?.outstanding) }}</strong><small>Outstanding</small></div>
            </div>
            <div class="fee-tile">
              <span class="fee-tile-icon"><app-icon name="file-text" [size]="18" /></span>
              <div class="fee-tile-body"><strong>{{ money(fees?.invoiced) }}</strong><small>Invoiced</small></div>
            </div>
            <div class="fee-tile fee-tile-out">
              <span class="fee-tile-icon"><app-icon name="trending-down" [size]="18" /></span>
              <div class="fee-tile-body"><strong>{{ money(fees?.spent) }}</strong><small>Spent</small></div>
            </div>
          </div>
        }

        @if (active === 'exam') {
          <header class="report-head">
            <div>
              <h2 class="report-title">Exam performance</h2>
              <p class="report-subtitle">Average, highest, and lowest marks for a single exam.</p>
            </div>
            <div class="exam-select">
              <select class="form-control" [(ngModel)]="examId" (ngModelChange)="loadExam()">
                <option [ngValue]="null">Choose an exam…</option>
                @for (e of exams; track e.id) { <option [ngValue]="e.id">{{ e.name || e.title || ('Exam #' + e.id) }}</option> }
              </select>
            </div>
          </header>
          @if (!examId) {
            <div class="report-empty">
              <div class="report-empty-icon"><app-icon name="award" [size]="28" /></div>
              <strong>{{ exams.length ? 'Choose an exam' : 'No exams found' }}</strong>
              <span>{{ exams.length ? 'Pick an exam from the dropdown to see its performance breakdown.' : 'Create an exam first to view its performance metrics.' }}</span>
            </div>
          } @else if (perf) {
            <div class="exam-grid">
              <div class="exam-tile exam-tile-avg">
                <span class="exam-tile-icon"><app-icon name="bar-chart" [size]="18" /></span>
                <div><strong>{{ round(perf.average) }}</strong><small>Average</small></div>
              </div>
              <div class="exam-tile exam-tile-high">
                <span class="exam-tile-icon"><app-icon name="trending-up" [size]="18" /></span>
                <div><strong>{{ perf.highest }}</strong><small>Highest</small></div>
              </div>
              <div class="exam-tile exam-tile-low">
                <span class="exam-tile-icon"><app-icon name="trending-down" [size]="18" /></span>
                <div><strong>{{ perf.lowest }}</strong><small>Lowest</small></div>
              </div>
              <div class="exam-tile">
                <span class="exam-tile-icon"><app-icon name="users" [size]="18" /></span>
                <div><strong>{{ perf.totalStudents }}</strong><small>Students</small></div>
              </div>
            </div>
          } @else {
            <div class="report-skel-line"></div>
          }
        }

        @if (active === 'snapshot') {
          <header class="report-head">
            <div>
              <h2 class="report-title">Snapshot &amp; ratios</h2>
              <p class="report-subtitle">A bird's-eye view of the school's people and finances.</p>
            </div>
          </header>
          <div class="snap-grid">
            <div class="snap-tile snap-tile-primary">
              <span class="snap-tile-icon"><app-icon name="users" [size]="18" /></span>
              <div><strong>{{ snap?.students ?? 0 }}</strong><small>Students</small></div>
            </div>
            <div class="snap-tile snap-tile-info">
              <span class="snap-tile-icon"><app-icon name="user-check" [size]="18" /></span>
              <div><strong>{{ snap?.teachers ?? 0 }}</strong><small>Teachers</small></div>
            </div>
            <div class="snap-tile snap-tile-neutral">
              <span class="snap-tile-icon"><app-icon name="briefcase" [size]="18" /></span>
              <div><strong>{{ snap?.staff ?? 0 }}</strong><small>Staff</small></div>
            </div>
            <div class="snap-tile snap-tile-success">
              <span class="snap-tile-icon"><app-icon name="scale" [size]="18" /></span>
              <div><strong>{{ snap?.ratio }}</strong><small>Student : Teacher</small></div>
            </div>
            <div class="snap-tile snap-tile-success">
              <span class="snap-tile-icon"><app-icon name="dollar" [size]="18" /></span>
              <div><strong>{{ money(snap?.collected) }}</strong><small>Collected</small></div>
            </div>
            <div class="snap-tile snap-tile-warn">
              <span class="snap-tile-icon"><app-icon name="file-text" [size]="18" /></span>
              <div><strong>{{ snap?.pendingInvoices ?? 0 }}</strong><small>Pending invoices</small></div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    /* Tab navigation */
    .report-nav { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .report-tab { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); cursor: pointer; text-align: left; color: var(--text-muted); transition: all .15s; }
    .report-tab:hover { border-color: var(--primary); }
    .report-tab.active { border-color: var(--primary); background: var(--primary-light); color: var(--primary); }
    .report-tab-icon { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--neutral-100); color: var(--text-muted); flex-shrink: 0; }
    .report-tab.active .report-tab-icon { background: var(--primary); color: #fff; }
    body.dark-theme .report-tab.active .report-tab-icon { background: var(--primary); color: #fff; }
    .report-tab-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .report-tab-copy strong { font-size: 13px; font-weight: 700; }
    .report-tab-copy small { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Header */
    .report-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .report-title { margin: 0; font-size: 17px; font-weight: 700; }
    .report-subtitle { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
    .report-head-meta { display: flex; gap: 8px; flex-wrap: wrap; }
    .report-meta-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 999px; background: var(--neutral-100); color: var(--text-muted); font-size: 11px; font-weight: 600; }
    .report-dates { display: flex; gap: 8px; }
    .report-date { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-muted); font-weight: 600; }
    .report-date .form-control { max-width: 160px; }

    /* By class bar chart */
    .bar-chart { padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 12px; }
    .bar-label { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { height: 26px; background: var(--neutral-100); border-radius: 6px; overflow: hidden; position: relative; }
    body.dark-theme .bar-track { background: rgba(255,255,255,.06); }
    .bar-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--primary-dark, var(--primary))); border-radius: inherit; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; min-width: 32px; transition: width .4s ease; }
    .bar-value { color: #fff; font-size: 11px; font-weight: 700; }

    /* Attendance ring */
    .attendance-display { display: flex; align-items: center; gap: 32px; padding: 24px 20px; flex-wrap: wrap; }
    .attendance-ring { position: relative; width: 140px; height: 140px; flex-shrink: 0; }
    .ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: var(--neutral-100); stroke-width: 10; }
    body.dark-theme .ring-bg { stroke: rgba(255,255,255,.08); }
    .ring-fill { fill: none; stroke: var(--success); stroke-width: 10; stroke-linecap: round; stroke-dasharray: 327; transition: stroke-dashoffset .8s ease; }
    .attendance-ring-value { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
    .attendance-ring-value strong { font-size: 26px; font-weight: 700; color: var(--text); }
    .attendance-ring-value small { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
    .attendance-stats { display: flex; flex-direction: column; gap: 12px; flex: 1; min-width: 200px; }
    .attendance-stat { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
    .attendance-stat-icon { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; flex-shrink: 0; }
    .attendance-stat-present { background: rgba(22,163,74,.12); color: var(--success); }
    .attendance-stat-total { background: var(--primary-light); color: var(--primary); }
    .attendance-stat-absent { background: rgba(192,57,43,.12); color: var(--danger); }
    body.dark-theme .attendance-stat-present { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .attendance-stat-absent { background: rgba(192,57,43,.22); color: #fca5a5; }
    .attendance-stat strong { font-size: 16px; font-weight: 700; display: block; }
    .attendance-stat small { font-size: 11px; color: var(--text-muted); }

    /* Fees */
    .fees-grid { padding: 16px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .fee-tile { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .fee-tile-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--neutral-100); color: var(--text-muted); flex-shrink: 0; }
    .fee-tile-body strong { display: block; font-size: 18px; font-weight: 700; }
    .fee-tile-body small { font-size: 11px; color: var(--text-muted); }
    .fee-tile-in .fee-tile-icon { background: rgba(22,163,74,.12); color: var(--success); }
    .fee-tile-out .fee-tile-icon { background: rgba(192,57,43,.12); color: var(--danger); }
    .fee-tile-net .fee-tile-icon { background: var(--primary-light); color: var(--primary); }
    .fee-tile-warn .fee-tile-icon { background: rgba(217,119,6,.14); color: var(--warning); }
    body.dark-theme .fee-tile-in .fee-tile-icon { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .fee-tile-out .fee-tile-icon { background: rgba(192,57,43,.22); color: #fca5a5; }
    body.dark-theme .fee-tile-warn .fee-tile-icon { background: rgba(217,119,6,.22); color: #fcd34d; }

    /* Exam */
    .exam-select { min-width: 260px; }
    .exam-grid { padding: 16px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .exam-tile { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .exam-tile-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; background: var(--neutral-100); color: var(--text-muted); }
    .exam-tile strong { display: block; font-size: 22px; font-weight: 700; }
    .exam-tile small { font-size: 11px; color: var(--text-muted); }
    .exam-tile-avg .exam-tile-icon { background: var(--primary-light); color: var(--primary); }
    .exam-tile-high .exam-tile-icon { background: rgba(22,163,74,.12); color: var(--success); }
    .exam-tile-low .exam-tile-icon { background: rgba(192,57,43,.12); color: var(--danger); }
    body.dark-theme .exam-tile-high .exam-tile-icon { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .exam-tile-low .exam-tile-icon { background: rgba(192,57,43,.22); color: #fca5a5; }

    /* Snapshot */
    .snap-grid { padding: 16px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .snap-tile { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .snap-tile-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; background: var(--neutral-100); color: var(--text-muted); }
    .snap-tile strong { display: block; font-size: 20px; font-weight: 700; }
    .snap-tile small { font-size: 11px; color: var(--text-muted); }
    .snap-tile-primary .snap-tile-icon { background: var(--primary-light); color: var(--primary); }
    .snap-tile-info .snap-tile-icon { background: rgba(31,111,235,.12); color: #1f6feb; }
    .snap-tile-success .snap-tile-icon { background: rgba(22,163,74,.12); color: var(--success); }
    .snap-tile-warn .snap-tile-icon { background: rgba(217,119,6,.14); color: var(--warning); }
    body.dark-theme .snap-tile-info .snap-tile-icon { background: rgba(31,111,235,.22); color: #93c5fd; }
    body.dark-theme .snap-tile-success .snap-tile-icon { background: rgba(22,163,74,.22); color: #6ee7a0; }
    body.dark-theme .snap-tile-warn .snap-tile-icon { background: rgba(217,119,6,.22); color: #fcd34d; }

    /* Empty */
    .report-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 56px 24px; text-align: center; }
    .report-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .report-empty strong { font-size: 14px; color: var(--text); }
    .report-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; line-height: 1.4; }

    /* Skeletons */
    .report-skel { padding: 16px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .report-tile-skel { height: 70px; border-radius: 12px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: report-shimmer 1.4s ease infinite; }
    .report-skel-line { height: 20px; margin: 16px 20px; border-radius: 4px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: report-shimmer 1.4s ease infinite; }
    @keyframes report-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    @media (max-width: 800px) {
      .report-head { flex-direction: column; align-items: stretch; }
      .bar-row { grid-template-columns: 110px 1fr; }
      .attendance-display { flex-direction: column; align-items: stretch; }
    }
    @media (max-width: 560px) {
      .report-dates { flex-direction: column; }
      .bar-row { grid-template-columns: 1fr; gap: 4px; }
    }
  `],
})
export class ReportsComponent implements OnInit {
  readonly tabs: ReportTab[] = [
    { key: 'byclass', label: 'By Class', icon: 'users', description: 'Enrolments per class' },
    { key: 'attendance', label: 'Attendance', icon: 'check-square', description: 'Present rate over time' },
    { key: 'fees', label: 'Fees', icon: 'dollar', description: 'Money in vs out' },
    { key: 'exam', label: 'Exam', icon: 'award', description: 'Performance per exam' },
    { key: 'snapshot', label: 'Snapshot', icon: 'layers', description: 'School-wide ratios' },
  ];
  active = 'byclass';
  byClass: ByClassRow[] = [];
  ar: any = null;
  fees: any = null;
  perf: any = null;
  snap: any = null;
  examId: number | null = null;
  exams: any[] = [];
  dateFrom = '';
  dateTo = '';
  loading = false;

  constructor(private readonly api: ApiService, private readonly toasts: ToastService) {}

  ngOnInit(): void { this.loadActive(); }

  get byClassSorted(): ByClassRow[] {
    return [...this.byClass].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }

  get totalEnrolments(): number {
    return this.byClass.reduce((sum, r) => sum + (r.count ?? 0), 0);
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
      this.api.get<ByClassRow[]>('/reports/students-by-class').subscribe({ next: (r) => { this.byClass = r?.data ?? []; this.loading = false; }, error: () => { this.loading = false; } });
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
    if (!this.examId || this.examId <= 0) { this.perf = null; return; }
    this.api.get<any>('/reports/exam-performance', { examId: this.examId }).subscribe({ next: (r) => (this.perf = r?.data), error: () => {} });
  }

  /** Convert a 0-100 percentage to the stroke-dashoffset for the SVG ring (circumference = 327px for r=52). */
  ringOffset(rate: number): number {
    const clamped = Math.max(0, Math.min(100, Number(rate ?? 0)));
    return 327 - (327 * clamped / 100);
  }

  /** Width % for the by-class bar chart — relative to the largest class count. */
  barPct(count: number): number {
    const max = Math.max(1, ...this.byClass.map(r => r.count ?? 0));
    return Math.max(8, Math.round((count / max) * 100));
  }

  money(v: unknown): string { return formatMoney(v); }
  round(n: unknown): string {
    const x = Number(n ?? 0);
    return Number.isInteger(x) ? String(x) : x.toFixed(2);
  }
}
