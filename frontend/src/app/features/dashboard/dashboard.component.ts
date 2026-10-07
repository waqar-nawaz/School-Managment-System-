import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
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

interface QuickAction {
  label: string;
  icon: string;
  link: string;
  permission: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New admission', icon: 'plus', link: '/admissions', permission: 'admissions:create' },
  { label: 'Take attendance', icon: 'check-square', link: '/attendance', permission: 'attendance:create' },
  { label: 'New invoice', icon: 'file-text', link: '/invoices', permission: 'invoices:create' },
  { label: 'Reports', icon: 'bar-chart', link: '/reports', permission: 'reports:read' },
  { label: 'Add notice', icon: 'megaphone', link: '/notices', permission: 'notices:create' },
  { label: 'Apply leave', icon: 'clock', link: '/leaves', permission: 'leaves:create' },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent, FormsModule],
  template: `
    <div class="dashboard">
      <div class="dash-hero">
        <div>
          <span class="dash-kicker">{{ greeting }}</span>
          <h1 class="page-title">{{ heroTitle }}</h1>
          <p class="page-subtitle">{{ heroSubtitle }}</p>
        </div>
        <div class="dash-date-nav">
          <button type="button" class="dash-date-btn" (click)="shiftDay(-1)" aria-label="Previous day"><app-icon name="chevron-left" [size]="14" /></button>
          <input type="date" class="dash-date-input" [ngModel]="selectedDate" (ngModelChange)="onDateChange($any($event))" />
          <button type="button" class="dash-date-btn" (click)="shiftDay(1)" aria-label="Next day"><app-icon name="chevron-right" [size]="14" /></button>
          @if (selectedDate !== todayISO) {
            <button type="button" class="dash-today-btn" (click)="goToday()">Today</button>
          }
        </div>
      </div>

      @if (loading) {
        <div class="dash-skeleton-grid">
          <div class="skel skel-overview"></div>
          <div class="skel skel-panel"></div>
          <div class="skel skel-panel"></div>
          <div class="skel skel-panel"></div>
          <div class="skel skel-panel"></div>
        </div>
      } @else {
        <!-- Admin / Principal / Super-admin: full overview -->
        @if (isAdminView) {
          <section class="dash-overview">
            <a class="overview-primary" routerLink="/students">
              <div class="overview-primary-top">
                <span class="overview-icon"><app-icon name="users" [size]="20" /></span>
                <span class="overview-link">View students <app-icon name="arrow-right" [size]="14" /></span>
              </div>
              <div class="overview-number">{{ stats?.students ?? 0 }}</div>
              <div class="overview-label">Total Students</div>
              <div class="overview-meta">{{ stats?.activeEnrolments ?? 0 }} active enrolments</div>
            </a>
            <div class="overview-secondary">
              <a class="metric-row" routerLink="/teachers">
                <span class="metric-icon"><app-icon name="user-check" [size]="17" /></span>
                <span class="metric-copy"><strong>{{ stats?.teachers ?? 0 }}</strong><small>Teachers</small></span>
                <app-icon name="chevron-right" [size]="14" />
              </a>
              <a class="metric-row" routerLink="/classes">
                <span class="metric-icon"><app-icon name="home" [size]="17" /></span>
                <span class="metric-copy"><strong>{{ stats?.classes ?? 0 }}</strong><small>Classes</small></span>
                <app-icon name="chevron-right" [size]="14" />
              </a>
              <a class="metric-row" routerLink="/attendance">
                <span class="metric-icon"><app-icon name="check-square" [size]="17" /></span>
                <span class="metric-copy"><strong>{{ stats?.presentToday ?? 0 }}</strong><small>Present today</small></span>
                <app-icon name="chevron-right" [size]="14" />
              </a>
            </div>
          </section>

          <section class="dash-main-grid">
            <div class="dash-panel">
              <div class="dash-panel-head">
                <div><h2>Needs attention</h2><p>Items that may need action today</p></div>
                <app-icon name="bell" [size]="18" />
              </div>
              <div class="attention-list">
                @if (canSee('admissions:read')) {
                  <a class="attention-item" routerLink="/admissions">
                    <span class="attention-icon"><app-icon name="clipboard" [size]="17" /></span>
                    <span class="attention-copy"><strong>Admissions</strong><small>Open applications</small></span>
                    @if ((stats?.admissionApplications ?? 0) > 0) {
                      <b>{{ stats?.admissionApplications }}</b>
                    } @else {
                      <span class="attention-zero"><app-icon name="check" [size]="13" /> 0</span>
                    }
                  </a>
                }
                @if (canSee('invoices:read')) {
                  <a class="attention-item" routerLink="/invoices">
                    <span class="attention-icon"><app-icon name="file-text" [size]="17" /></span>
                    <span class="attention-copy"><strong>Finance</strong><small>Pending invoices</small></span>
                    @if ((stats?.pendingInvoices ?? 0) > 0) {
                      <b>{{ stats?.pendingInvoices }}</b>
                    } @else {
                      <span class="attention-zero"><app-icon name="check" [size]="13" /> 0</span>
                    }
                  </a>
                }
                @if (canSee('leaves:read')) {
                  <a class="attention-item" routerLink="/leaves">
                    <span class="attention-icon"><app-icon name="clock" [size]="17" /></span>
                    <span class="attention-copy"><strong>Leave requests</strong><small>Waiting for review</small></span>
                    @if ((stats?.pendingLeaves ?? 0) > 0) {
                      <b>{{ stats?.pendingLeaves }}</b>
                    } @else {
                      <span class="attention-zero"><app-icon name="check" [size]="13" /> 0</span>
                    }
                  </a>
                }
              </div>
              @if (allCaughtUp) {
                <div class="caught-up">
                  <app-icon name="check" [size]="16" />
                  <span>All caught up! No pending items today.</span>
                </div>
              }
            </div>

            @if (canSee('hostels:read') || canSee('beds:read')) {
              <div class="dash-panel">
                <div class="dash-panel-head">
                  <div><h2>Hostel</h2><p>Current room capacity</p></div>
                  <app-icon name="bed" [size]="18" />
                </div>
                <div class="hostel-summary">
                  <div class="hostel-big"><strong>{{ stats?.activeHostelResidents ?? 0 }}</strong><span>Residents</span></div>
                  <div><strong>{{ stats?.freeBeds ?? 0 }}</strong><span>Free beds</span></div>
                  <div><strong>{{ stats?.occupiedBeds ?? 0 }}</strong><span>Occupied</span></div>
                </div>
                <div class="hostel-bar"><span [style.width.%]="hostelOccupancy"></span></div>
                <div class="hostel-bar-label"><span>Occupancy</span><strong>{{ hostelOccupancy }}%</strong></div>
                <a class="panel-link" routerLink="/beds">Open bed inventory <app-icon name="arrow-right" [size]="14" /></a>
              </div>
            }
          </section>

          <section class="dash-bottom">
            <div class="dash-panel">
              <div class="dash-panel-head"><div><h2>People &amp; academics</h2><p>At-a-glance totals</p></div></div>
              <div class="mini-stats">
                @if (canSee('staff:read')) { <a routerLink="/staff"><strong>{{ stats?.staff ?? 0 }}</strong><span>Staff</span></a> }
                @if (canSee('students:read')) { <a routerLink="/enrolments"><strong>{{ stats?.activeEnrolments ?? 0 }}</strong><span>Enrolments</span></a> }
                <a routerLink="/attendance"><strong>{{ stats?.presentToday ?? 0 }}</strong><span>Present today</span></a>
              </div>
            </div>
            <div class="dash-panel">
              <div class="dash-panel-head"><div><h2>Quick actions</h2><p>Common tasks</p></div></div>
              <div class="quick-actions">
                @for (action of allowedQuickActions; track action.link) {
                  <a [routerLink]="action.link">
                    <app-icon [name]="action.icon" [size]="16" />
                    {{ action.label }}
                  </a>
                }
                @empty {
                  <span class="no-actions">No quick actions available for your role.</span>
                }
              </div>
            </div>
          </section>
        }

        <!-- Non-admin roles (student/teacher/parent/staff): personalised view -->
        @if (!isAdminView) {
          <section class="dash-overview dash-overview-personal">
            <a class="overview-primary overview-primary-personal" routerLink="/leaves">
              <div class="overview-primary-top">
                <span class="overview-icon"><app-icon name="clock" [size]="20" /></span>
                <span class="overview-link">My leaves <app-icon name="arrow-right" [size]="14" /></span>
              </div>
              <div class="overview-number">{{ stats?.pendingLeaves ?? 0 }}</div>
              <div class="overview-label">Pending leaves</div>
              <div class="overview-meta">{{ stats?.upcomingEvents ?? 0 }} upcoming events</div>
            </a>
            <div class="overview-secondary">
              @if (canSee('attendance:read')) {
                <a class="metric-row" routerLink="/attendance">
                  <span class="metric-icon"><app-icon name="check-square" [size]="17" /></span>
                  <span class="metric-copy"><strong>{{ stats?.presentToday ?? 0 }}</strong><small>Present today</small></span>
                  <app-icon name="chevron-right" [size]="14" />
                </a>
              }
              @if (canSee('events:read')) {
                <a class="metric-row" routerLink="/events">
                  <span class="metric-icon"><app-icon name="calendar" [size]="17" /></span>
                  <span class="metric-copy"><strong>{{ stats?.upcomingEvents ?? 0 }}</strong><small>Upcoming events</small></span>
                  <app-icon name="chevron-right" [size]="14" />
                </a>
              }
              @if (canSee('invoices:read')) {
                <a class="metric-row" routerLink="/invoices">
                  <span class="metric-icon"><app-icon name="file-text" [size]="17" /></span>
                  <span class="metric-copy"><strong>{{ stats?.pendingInvoices ?? 0 }}</strong><small>Pending invoices</small></span>
                  <app-icon name="chevron-right" [size]="14" />
                </a>
              }
            </div>
          </section>

          <section class="dash-main-grid dash-main-grid-single">
            <div class="dash-panel">
              <div class="dash-panel-head">
                <div><h2>Your shortcuts</h2><p>Jump to the sections you use most</p></div>
                <app-icon name="bell" [size]="18" />
              </div>
              <div class="shortcut-list">
                @if (canSee('attendance:read')) {
                  <a class="shortcut-item" routerLink="/attendance">
                    <span class="shortcut-icon"><app-icon name="check-square" [size]="18" /></span>
                    <span class="shortcut-copy"><strong>Attendance</strong><small>View your attendance history</small></span>
                    <app-icon name="chevron-right" [size]="14" />
                  </a>
                }
                @if (canSee('exam-results:read')) {
                  <a class="shortcut-item" routerLink="/exam-results">
                    <span class="shortcut-icon"><app-icon name="clipboard" [size]="18" /></span>
                    <span class="shortcut-copy"><strong>Exam results</strong><small>Your recent grades and marks</small></span>
                    <app-icon name="chevron-right" [size]="14" />
                  </a>
                }
                @if (canSee('library:read')) {
                  <a class="shortcut-item" routerLink="/book-issues">
                    <span class="shortcut-icon"><app-icon name="book" [size]="18" /></span>
                    <span class="shortcut-copy"><strong>Library</strong><small>Issued books and fines</small></span>
                    <app-icon name="chevron-right" [size]="14" />
                  </a>
                }
                @if (canSee('leaves:read')) {
                  <a class="shortcut-item" routerLink="/leaves">
                    <span class="shortcut-icon"><app-icon name="clock" [size]="18" /></span>
                    <span class="shortcut-copy"><strong>My leaves</strong><small>Apply for leave and view status</small></span>
                    <app-icon name="chevron-right" [size]="14" />
                  </a>
                }
                @if (canSee('messages:read')) {
                  <a class="shortcut-item" routerLink="/messages">
                    <span class="shortcut-icon"><app-icon name="message" [size]="18" /></span>
                    <span class="shortcut-copy"><strong>Messages</strong><small>Inbox and conversations</small></span>
                    <app-icon name="chevron-right" [size]="14" />
                  </a>
                }
                @if (canSee('notices:read')) {
                  <a class="shortcut-item" routerLink="/notices">
                    <span class="shortcut-icon"><app-icon name="megaphone" [size]="18" /></span>
                    <span class="shortcut-copy"><strong>Notices</strong><small>Latest announcements</small></span>
                    <app-icon name="chevron-right" [size]="14" />
                  </a>
                }
              </div>
            </div>

            <div class="dash-panel">
              <div class="dash-panel-head">
                <div><h2>Quick actions</h2><p>Tasks you can perform</p></div>
              </div>
              <div class="quick-actions">
                @for (action of allowedQuickActions; track action.link) {
                  <a [routerLink]="action.link">
                    <app-icon [name]="action.icon" [size]="16" />
                    {{ action.label }}
                  </a>
                }
                @empty {
                  <span class="no-actions">No quick actions available for your role.</span>
                }
              </div>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    :host{display:block}.dashboard{color:var(--text)}
    .dash-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}
    .dash-kicker{display:block;margin-bottom:5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
    .dash-date-nav{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px}
    .dash-date-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;background:transparent;border-radius:6px;color:var(--text-muted);cursor:pointer;transition:background .15s,color .15s}
    .dash-date-btn:hover{background:var(--neutral-100);color:var(--text)}
    .dash-date-input{border:0;background:transparent;font-size:12px;color:var(--text-muted);font-family:inherit;padding:4px 6px;outline:none}
    .dash-today-btn{border:1px solid var(--border);background:var(--surface);color:var(--primary);font-size:11px;font-weight:600;border-radius:6px;padding:4px 8px;cursor:pointer;margin-left:2px}
    .dash-today-btn:hover{background:var(--primary-light)}

    .dash-skeleton-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .skel{border-radius:14px;background:linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%);background-size:400% 100%;animation:dash-shimmer 1.4s ease infinite;min-height:120px}
    .skel-overview{grid-column:1 / -1;min-height:170px}
    @keyframes dash-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}

    .dash-overview{display:grid;grid-template-columns:1.4fr 1fr;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface);margin-bottom:16px}
    .overview-primary{padding:22px 24px;text-decoration:none;color:inherit;background:var(--neutral-50);border-right:1px solid var(--border)}
    .overview-primary-top{display:flex;align-items:center;justify-content:space-between}
    .overview-icon{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background:var(--primary-light);color:var(--primary)}
    .overview-link,.panel-link{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--primary)}
    .overview-number{margin-top:25px;font-size:34px;line-height:1;font-weight:750}
    .overview-label{margin-top:6px;font-size:13px;font-weight:600}
    .overview-meta{margin-top:3px;font-size:11px;color:var(--text-muted)}
    .overview-secondary{padding:8px 0}
    .metric-row{display:flex;align-items:center;gap:11px;padding:13px 18px;text-decoration:none;color:inherit}
    .metric-row:hover,.attention-item:hover,.mini-stats a:hover,.shortcut-item:hover{background:var(--row-hover)}
    .metric-row>app-icon{margin-left:auto;color:var(--text-muted,#98a2b3)}
    .metric-icon{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--neutral-100);color:var(--text-muted)}
    .metric-copy{display:flex;flex-direction:column;gap:2px}
    .metric-copy strong{font-size:16px}.metric-copy small{font-size:11px;color:var(--text-muted)}

    .dash-main-grid,.dash-bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
    .dash-main-grid-single{grid-template-columns:1fr 1fr}
    .dash-panel{border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}
    .dash-panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border)}
    .dash-panel-head h2{margin:0;font-size:13px;font-weight:700}
    .dash-panel-head p{margin:3px 0 0;font-size:11px;color:var(--text-muted)}
    .dash-panel-head>app-icon{color:var(--text-muted,#98a2b3)}

    .attention-list{padding:5px 0}
    .attention-item{display:flex;align-items:center;gap:11px;padding:11px 18px;text-decoration:none;color:inherit}
    .attention-icon{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--neutral-100);color:var(--text-muted)}
    .attention-copy{display:flex;flex-direction:column;gap:2px;flex:1}
    .attention-copy strong{font-size:12px}
    .attention-copy small{font-size:10px;color:var(--text-muted)}
    .attention-item b{font-size:13px}
    .attention-zero{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--success,#16a34a);font-weight:600}
    .caught-up{display:flex;align-items:center;gap:8px;padding:14px 18px;border-top:1px solid var(--border);background:rgba(22,163,74,.06);color:var(--success,#16a34a);font-size:12px;font-weight:600}
    .caught-up app-icon{color:var(--success,#16a34a)}

    .hostel-summary{display:grid;grid-template-columns:1.3fr 1fr 1fr;padding:18px}
    .hostel-summary>div{padding-right:12px}
    .hostel-summary>div+div{padding-left:12px;border-left:1px solid var(--border)}
    .hostel-summary strong{display:block;font-size:20px}
    .hostel-summary span{display:block;margin-top:4px;font-size:10px;color:var(--text-muted)}
    .hostel-big strong{font-size:26px}
    .hostel-bar{height:6px;margin:0 18px;border-radius:999px;background:var(--neutral-100);overflow:hidden}
    .hostel-bar span{display:block;height:100%;background:var(--primary);border-radius:inherit}
    .hostel-bar-label{display:flex;justify-content:space-between;padding:7px 18px 14px;font-size:10px;color:var(--text-muted)}
    .panel-link{margin:0 18px 16px}

    .shortcut-list{padding:5px 0}
    .shortcut-item{display:flex;align-items:center;gap:11px;padding:13px 18px;text-decoration:none;color:inherit}
    .shortcut-item>app-icon{margin-left:auto;color:var(--text-muted,#98a2b3)}
    .shortcut-icon{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background:var(--primary-light);color:var(--primary)}
    .shortcut-copy{display:flex;flex-direction:column;gap:2px;flex:1}
    .shortcut-copy strong{font-size:13px}
    .shortcut-copy small{font-size:11px;color:var(--text-muted)}

    .mini-stats{display:grid;grid-template-columns:repeat(3,1fr)}
    .mini-stats a{padding:15px 18px;text-decoration:none;color:inherit}
    .mini-stats a+a{border-left:1px solid var(--border)}
    .mini-stats strong{display:block;font-size:18px}
    .mini-stats span{display:block;margin-top:3px;font-size:10px;color:var(--text-muted)}
    .quick-actions{display:flex;flex-wrap:wrap;gap:8px;padding:14px 18px}
    .quick-actions a{display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;text-decoration:none;color:inherit;font-size:11px;font-weight:600;background:var(--surface);transition:background .15s,border-color .15s}
    .quick-actions a:hover{background:var(--primary-light);border-color:var(--primary)}
    .no-actions{display:block;padding:6px 0;font-size:12px;color:var(--text-muted);font-style:italic}

    .dash-overview-personal{grid-template-columns:1fr 1fr}
    .overview-primary-personal{background:var(--neutral-50)}

    @media(max-width:820px){
      .dash-overview,.dash-main-grid,.dash-bottom,.dash-main-grid-single{grid-template-columns:1fr}
      .overview-primary{border-right:0;border-bottom:1px solid var(--border)}
      .dash-skeleton-grid{grid-template-columns:1fr}
    }
    @media(max-width:560px){
      .dash-hero{align-items:flex-start;flex-direction:column}
      .mini-stats{grid-template-columns:1fr}
      .mini-stats a+a{border-left:0;border-top:1px solid var(--border)}
    }
  `],
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;
  selectedDate: string = new Date().toLocaleDateString('en-CA');
  readonly todayISO: string = new Date().toLocaleDateString('en-CA');

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly auth: AuthService,
    private readonly perms: PermissionService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Working late';
  }

  get heroTitle(): string {
    const name = this.auth.user?.firstName?.trim();
    if (!name) return 'Dashboard';
    return `${this.greeting}, ${name}`;
  }

  get heroSubtitle(): string {
    if (this.isAdminView) return 'A quick view of what needs attention today.';
    return 'Here is what is happening in your school today.';
  }

  /** Admin/principal/super_admin see the full overview with KPIs. Everyone else gets the
   *  personalised shortcuts view (student/teacher/parent/staff/etc.). */
  get isAdminView(): boolean {
    return this.perms.isRole('super_admin', 'admin', 'principal');
  }

  get allowedQuickActions(): QuickAction[] {
    return QUICK_ACTIONS.filter(a => this.perms.hasPermission(a.permission));
  }

  get hostelOccupancy(): number {
    const o = this.stats?.occupiedBeds ?? 0;
    const f = this.stats?.freeBeds ?? 0;
    const total = o + f;
    return total ? Math.round((o / total) * 100) : 0;
  }

  get allCaughtUp(): boolean {
    if (!this.isAdminView) return false;
    const s = this.stats;
    if (!s) return false;
    const items = [
      this.canSee('admissions:read') ? s.admissionApplications : 0,
      this.canSee('invoices:read') ? s.pendingInvoices : 0,
      this.canSee('leaves:read') ? s.pendingLeaves : 0,
    ].filter((_, i) => i >= 0);
    return items.every(n => n === 0) && items.length > 0;
  }

  canSee(permission: string): boolean {
    return this.perms.hasPermission(permission);
  }

  onDateChange(value: string): void {
    if (!value) return;
    this.selectedDate = value;
    this.load();
  }

  shiftDay(delta: number): void {
    const d = new Date(this.selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    this.selectedDate = d.toLocaleDateString('en-CA');
    this.load();
  }

  goToday(): void {
    this.selectedDate = this.todayISO;
    this.load();
  }

  load(): void {
    this.loading = true;
    // Send the browser-local date so the backend's `presentToday` count uses the same "today" as the user.
    this.api.get<DashboardStats>('/dashboard', { date: this.selectedDate }).subscribe({
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
