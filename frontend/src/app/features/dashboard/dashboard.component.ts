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
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Overview of your school today</p>
      </div>
    </div>

    @if (loading) {
      <div class="card"><p class="form-hint">Loading…</p></div>
    } @else {
      <div class="stat-grid">
        <a class="stat-card" routerLink="/students">
          <span class="stat-icon"><app-icon name="users" [size]="18" /></span>
          <span class="stat-label">Students</span><span class="stat-value">{{ stats?.students ?? 0 }}</span>
        </a>
        <a class="stat-card" routerLink="/teachers">
          <span class="stat-icon"><app-icon name="user-check" [size]="18" /></span>
          <span class="stat-label">Teachers</span><span class="stat-value">{{ stats?.teachers ?? 0 }}</span>
        </a>
        <a class="stat-card" routerLink="/staff">
          <span class="stat-icon"><app-icon name="briefcase" [size]="18" /></span>
          <span class="stat-label">Staff</span><span class="stat-value">{{ stats?.staff ?? 0 }}</span>
        </a>
        <a class="stat-card" routerLink="/classes">
          <span class="stat-icon"><app-icon name="home" [size]="18" /></span>
          <span class="stat-label">Classes</span><span class="stat-value">{{ stats?.classes ?? 0 }}</span>
        </a>
        <a class="stat-card stat-warn" routerLink="/invoices">
          <span class="stat-icon"><app-icon name="file-text" [size]="18" /></span>
          <span class="stat-label">Pending Invoices</span><span class="stat-value">{{ stats?.pendingInvoices ?? 0 }}</span>
        </a>
        <a class="stat-card stat-ok" routerLink="/attendance">
          <span class="stat-icon"><app-icon name="check-square" [size]="18" /></span>
          <span class="stat-label">Present Today</span><span class="stat-value">{{ stats?.presentToday ?? 0 }}</span>
        </a>
        <a class="stat-card" routerLink="/events">
          <span class="stat-icon"><app-icon name="calendar" [size]="18" /></span>
          <span class="stat-label">Upcoming Events</span><span class="stat-value">{{ stats?.upcomingEvents ?? 0 }}</span>
        </a>
        <a class="stat-card stat-warn" routerLink="/leaves">
          <span class="stat-icon"><app-icon name="clipboard" [size]="18" /></span>
          <span class="stat-label">Pending Leave</span><span class="stat-value">{{ stats?.pendingLeaves ?? 0 }}</span>
        </a>
        <a class="stat-card" routerLink="/admissions">
          <span class="stat-icon"><app-icon name="clipboard" [size]="18" /></span>
          <span class="stat-label">Open Applications</span><span class="stat-value">{{ stats?.admissionApplications ?? 0 }}</span>
        </a>
        <a class="stat-card stat-ok" routerLink="/enrolments">
          <span class="stat-icon"><app-icon name="link" [size]="18" /></span>
          <span class="stat-label">Active Enrolments</span><span class="stat-value">{{ stats?.activeEnrolments ?? 0 }}</span>
        </a>
      </div>

      <div class="card">
        <h3 class="card-title">Quick actions</h3>
        <div class="page-actions" style="justify-content:flex-start;flex-wrap:wrap">
          <a class="btn btn-outline" routerLink="/admissions"><app-icon name="plus" [size]="15" /> New admission</a>
          <a class="btn btn-outline" routerLink="/attendance"><app-icon name="check-square" [size]="15" /> Take attendance</a>
          <a class="btn btn-outline" routerLink="/invoices"><app-icon name="file-text" [size]="15" /> Create invoice</a>
          <a class="btn btn-outline" routerLink="/reports"><app-icon name="bar-chart" [size]="15" /> Generate report</a>
        </div>
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.get<DashboardStats>('/dashboard').subscribe({
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