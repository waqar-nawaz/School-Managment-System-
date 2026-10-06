import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface DashboardStats {
  students: number;
  teachers: number;
  staff: number;
  classes: number;
  pendingInvoices: number;
  presentToday: number;
  upcomingEvents: number;
  pendingLeaves: number;
  admissionApplications: number;
  activeEnrolments: number;
  activeHostelResidents: number;
  freeBeds: number;
  occupiedBeds: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="dashboard">
      <div class="dash-hero"><div><span class="dash-kicker">School overview</span><h1 class="page-title">Dashboard</h1><p class="page-subtitle">A quick view of what needs attention today.</p></div><div class="dash-date">{{ todayLabel }}</div></div>
      @if (loading) { <div class="dash-loading"><span class="dash-spinner"></span> Loading dashboard…</div> } @else {
      <section class="dash-overview"><a class="overview-primary" routerLink="/students"><div class="overview-primary-top"><span class="overview-icon"><app-icon name="users" [size]="20" /></span><span class="overview-link">View students <app-icon name="arrow-right" [size]="14" /></span></div><div class="overview-number">{{ stats?.students ?? 0 }}</div><div class="overview-label">Total Students</div><div class="overview-meta">{{ stats?.activeEnrolments ?? 0 }} active enrolments</div></a><div class="overview-secondary"><a class="metric-row" routerLink="/teachers"><span class="metric-icon"><app-icon name="user-check" [size]="17" /></span><span class="metric-copy"><strong>{{ stats?.teachers ?? 0 }}</strong><small>Teachers</small></span><app-icon name="chevron-right" [size]="14" /></a><a class="metric-row" routerLink="/classes"><span class="metric-icon"><app-icon name="home" [size]="17" /></span><span class="metric-copy"><strong>{{ stats?.classes ?? 0 }}</strong><small>Classes</small></span><app-icon name="chevron-right" [size]="14" /></a><a class="metric-row" routerLink="/attendance"><span class="metric-icon"><app-icon name="check-square" [size]="17" /></span><span class="metric-copy"><strong>{{ stats?.presentToday ?? 0 }}</strong><small>Present today</small></span><app-icon name="chevron-right" [size]="14" /></a></div></section>
      <section class="dash-main-grid"><div class="dash-panel"><div class="dash-panel-head"><div><h2>Needs attention</h2><p>Items that may need action today</p></div><app-icon name="bell" [size]="18" /></div><div class="attention-list"><a class="attention-item" routerLink="/admissions"><span class="attention-icon"><app-icon name="clipboard" [size]="17" /></span><span class="attention-copy"><strong>Admissions</strong><small>Open applications</small></span><b>{{ stats?.admissionApplications ?? 0 }}</b></a><a class="attention-item" routerLink="/invoices"><span class="attention-icon"><app-icon name="file-text" [size]="17" /></span><span class="attention-copy"><strong>Finance</strong><small>Pending invoices</small></span><b>{{ stats?.pendingInvoices ?? 0 }}</b></a><a class="attention-item" routerLink="/leaves"><span class="attention-icon"><app-icon name="clock" [size]="17" /></span><span class="attention-copy"><strong>Leave requests</strong><small>Waiting for review</small></span><b>{{ stats?.pendingLeaves ?? 0 }}</b></a></div></div>
      <div class="dash-panel"><div class="dash-panel-head"><div><h2>Hostel</h2><p>Current room capacity</p></div><app-icon name="bed" [size]="18" /></div><div class="hostel-summary"><div class="hostel-big"><strong>{{ stats?.activeHostelResidents ?? 0 }}</strong><span>Residents</span></div><div><strong>{{ stats?.freeBeds ?? 0 }}</strong><span>Free beds</span></div><div><strong>{{ stats?.occupiedBeds ?? 0 }}</strong><span>Occupied</span></div></div><div class="hostel-bar"><span [style.width.%]="hostelOccupancy"></span></div><div class="hostel-bar-label"><span>Occupancy</span><strong>{{ hostelOccupancy }}%</strong></div><a class="panel-link" routerLink="/beds">Open bed inventory <app-icon name="arrow-right" [size]="14" /></a></div></section>
      <section class="dash-bottom"><div class="dash-panel"><div class="dash-panel-head"><div><h2>People & academics</h2><p>At-a-glance totals</p></div></div><div class="mini-stats"><a routerLink="/staff"><strong>{{ stats?.staff ?? 0 }}</strong><span>Staff</span></a><a routerLink="/enrolments"><strong>{{ stats?.activeEnrolments ?? 0 }}</strong><span>Enrolments</span></a><a routerLink="/attendance"><strong>{{ stats?.presentToday ?? 0 }}</strong><span>Present today</span></a></div></div><div class="dash-panel"><div class="dash-panel-head"><div><h2>Quick actions</h2><p>Common tasks</p></div></div><div class="quick-actions"><a routerLink="/admissions"><app-icon name="plus" [size]="16" /> New admission</a><a routerLink="/attendance"><app-icon name="check-square" [size]="16" /> Attendance</a><a routerLink="/invoices"><app-icon name="file-text" [size]="16" /> Invoice</a><a routerLink="/reports"><app-icon name="bar-chart" [size]="16" /> Reports</a></div></div></section>
      }
    </div>
  `,
  styles: [`
    :host{display:block}.dashboard{color:var(--text)}.dash-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.dash-kicker{display:block;margin-bottom:5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}.dash-date{padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text-muted);background:var(--surface)}
    .dash-overview{display:grid;grid-template-columns:1.4fr 1fr;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface);margin-bottom:16px}.overview-primary{padding:22px 24px;text-decoration:none;color:inherit;background:var(--neutral-50);border-right:1px solid var(--border)}.overview-primary-top{display:flex;align-items:center;justify-content:space-between}.overview-icon{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background:var(--primary-light);color:var(--primary)}.overview-link,.panel-link{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--primary)}.overview-number{margin-top:25px;font-size:34px;line-height:1;font-weight:750}.overview-label{margin-top:6px;font-size:13px;font-weight:600}.overview-meta{margin-top:3px;font-size:11px;color:var(--text-muted)}
    .overview-secondary{padding:8px 0}.metric-row{display:flex;align-items:center;gap:11px;padding:13px 18px;text-decoration:none;color:inherit}.metric-row:hover,.attention-item:hover,.mini-stats a:hover{background:var(--row-hover)}.metric-row>app-icon{margin-left:auto;color:var(--text-muted,#98a2b3)}.metric-icon{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--neutral-100);color:var(--text-muted)}.metric-copy{display:flex;flex-direction:column;gap:2px}.metric-copy strong{font-size:16px}.metric-copy small{font-size:11px;color:var(--text-muted)}
    .dash-main-grid,.dash-bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.dash-panel{border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}.dash-panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border)}.dash-panel-head h2{margin:0;font-size:13px;font-weight:700}.dash-panel-head p{margin:3px 0 0;font-size:11px;color:var(--text-muted)}.dash-panel-head>app-icon{color:var(--text-muted,#98a2b3)}
    .attention-list{padding:5px 0}.attention-item{display:flex;align-items:center;gap:11px;padding:11px 18px;text-decoration:none;color:inherit}.attention-icon{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--neutral-100);color:var(--text-muted)}.attention-copy{display:flex;flex-direction:column;gap:2px;flex:1}.attention-copy strong{font-size:12px}.attention-copy small{font-size:10px;color:var(--text-muted)}.attention-item b{font-size:13px}
    .hostel-summary{display:grid;grid-template-columns:1.3fr 1fr 1fr;padding:18px}.hostel-summary>div{padding-right:12px}.hostel-summary>div+div{padding-left:12px;border-left:1px solid var(--border)}.hostel-summary strong{display:block;font-size:20px}.hostel-summary span{display:block;margin-top:4px;font-size:10px;color:var(--text-muted)}.hostel-big strong{font-size:26px}.hostel-bar{height:6px;margin:0 18px;border-radius:999px;background:var(--neutral-100);overflow:hidden}.hostel-bar span{display:block;height:100%;background:var(--primary);border-radius:inherit}.hostel-bar-label{display:flex;justify-content:space-between;padding:7px 18px 14px;font-size:10px;color:var(--text-muted)}.panel-link{margin:0 18px 16px}
    .mini-stats{display:grid;grid-template-columns:repeat(3,1fr)}.mini-stats a{padding:15px 18px;text-decoration:none;color:inherit}.mini-stats a+a{border-left:1px solid var(--border)}.mini-stats strong{display:block;font-size:18px}.mini-stats span{display:block;margin-top:3px;font-size:10px;color:var(--text-muted)}.quick-actions{display:flex;flex-wrap:wrap;gap:8px;padding:14px 18px}.quick-actions a{display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;text-decoration:none;color:inherit;font-size:11px;font-weight:600;background:var(--surface)}.dash-loading{min-height:180px;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid var(--border);border-radius:14px;color:var(--text-muted);font-size:12px;background:var(--surface)}.dash-spinner{width:15px;height:15px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:dash-spin .7s linear infinite}@keyframes dash-spin{to{transform:rotate(360deg)}}
    @media(max-width:820px){.dash-overview,.dash-main-grid,.dash-bottom{grid-template-columns:1fr}.overview-primary{border-right:0;border-bottom:1px solid var(--border)}}@media(max-width:560px){.dash-hero{align-items:flex-start;flex-direction:column}.dash-date{display:none}.mini-stats{grid-template-columns:1fr}.mini-stats a+a{border-left:0;border-top:1px solid var(--border)}}
  `],
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;

  get todayLabel(): string { return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date()); }
  get hostelOccupancy(): number { const o=this.stats?.occupiedBeds ?? 0; const f=this.stats?.freeBeds ?? 0; const total=o+f; return total ? Math.round(o/total*100) : 0; }

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    // Send the browser-local date so the backend's `presentToday` count uses the same "today" as the user.
    this.api.get<DashboardStats>('/dashboard', { date: new Date().toLocaleDateString('en-CA') }).subscribe({
      next: (res) => {
        this.stats = res?.data ?? null;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.toasts.error(err?.error?.message || 'Failed to load dashboard');
      },
    });
  }
}