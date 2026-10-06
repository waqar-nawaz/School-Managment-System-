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
  template: `    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Overview of your school today</p>
      </div>
    </div>

    @if (loading) {
      <div class="card"><p class="form-hint">Loading…</p></div>
    } @else {
      <!-- People -->
      <div class="dash-section">
        <h3 class="dash-section-title"><app-icon name="users" [size]="16" /> People</h3>
        <div class="dash-cards">
          <a class="dash-card" routerLink="/students">
            <span class="dash-card-icon users"><app-icon name="users" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.students ?? 0 }}</span>
              <span class="dash-card-label">Students</span>
            </div>
          </a>
          <a class="dash-card" routerLink="/teachers">
            <span class="dash-card-icon teacher"><app-icon name="user-check" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.teachers ?? 0 }}</span>
              <span class="dash-card-label">Teachers</span>
            </div>
          </a>
          <a class="dash-card" routerLink="/staff">
            <span class="dash-card-icon staff"><app-icon name="briefcase" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.staff ?? 0 }}</span>
              <span class="dash-card-label">Staff</span>
            </div>
          </a>
        </div>
      </div>

      <!-- Academics -->
      <div class="dash-section">
        <h3 class="dash-section-title"><app-icon name="book" [size]="16" /> Academics</h3>
        <div class="dash-cards">
          <a class="dash-card" routerLink="/classes">
            <span class="dash-card-icon class"><app-icon name="home" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.classes ?? 0 }}</span>
              <span class="dash-card-label">Classes</span>
            </div>
          </a>
          <a class="dash-card dash-card-ok" routerLink="/enrolments">
            <span class="dash-card-icon enrol"><app-icon name="link" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.activeEnrolments ?? 0 }}</span>
              <span class="dash-card-label">Active Enrolments</span>
            </div>
          </a>
          <a class="dash-card dash-card-ok" routerLink="/attendance">
            <span class="dash-card-icon attend"><app-icon name="check-square" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.presentToday ?? 0 }}</span>
              <span class="dash-card-label">Present Today</span>
            </div>
          </a>
          <a class="dash-card" routerLink="/admissions">
            <span class="dash-card-icon admit"><app-icon name="clipboard" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.admissionApplications ?? 0 }}</span>
              <span class="dash-card-label">Open Applications</span>
            </div>
          </a>
        </div>
      </div>

      <!-- Finance -->
      <div class="dash-section">
        <h3 class="dash-section-title"><app-icon name="file-text" [size]="16" /> Finance</h3>
        <div class="dash-cards">
          <a class="dash-card dash-card-warn" routerLink="/invoices">
            <span class="dash-card-icon invoice"><app-icon name="file-text" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.pendingInvoices ?? 0 }}</span>
              <span class="dash-card-label">Pending Invoices</span>
            </div>
          </a>
          <a class="dash-card dash-card-warn" routerLink="/leaves">
            <span class="dash-card-icon leave"><app-icon name="clock" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.pendingLeaves ?? 0 }}</span>
              <span class="dash-card-label">Pending Leave</span>
            </div>
          </a>
        </div>
      </div>

      <!-- Hostel -->
      <div class="dash-section">
        <h3 class="dash-section-title"><app-icon name="bed" [size]="16" /> Hostel</h3>
        <div class="dash-cards">
          <a class="dash-card" routerLink="/hostel-allocations">
            <span class="dash-card-icon bed"><app-icon name="bed" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.activeHostelResidents ?? 0 }}</span>
              <span class="dash-card-label">Residents</span>
            </div>
          </a>
          <a class="dash-card dash-card-ok" routerLink="/beds">
            <span class="dash-card-icon freebed"><app-icon name="check-square" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.freeBeds ?? 0 }}</span>
              <span class="dash-card-label">Free Beds</span>
            </div>
          </a>
          <a class="dash-card dash-card-warn" routerLink="/beds">
            <span class="dash-card-icon occbed"><app-icon name="bed" [size]="20" /></span>
            <div class="dash-card-body">
              <span class="dash-card-value">{{ stats?.occupiedBeds ?? 0 }}</span>
              <span class="dash-card-label">Occupied Beds</span>
            </div>
          </a>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="dash-section">
        <h3 class="dash-section-title"><app-icon name="zap" [size]="16" /> Quick Actions</h3>
        <div class="dash-cards">
          <a class="dash-action" routerLink="/admissions">
            <span class="dash-action-icon"><app-icon name="plus" [size]="18" /></span>
            <span>New Admission</span>
          </a>
          <a class="dash-action" routerLink="/attendance">
            <span class="dash-action-icon"><app-icon name="check-square" [size]="18" /></span>
            <span>Take Attendance</span>
          </a>
          <a class="dash-action" routerLink="/invoices">
            <span class="dash-action-icon"><app-icon name="file-text" [size]="18" /></span>
            <span>Create Invoice</span>
          </a>
          <a class="dash-action" routerLink="/reports">
            <span class="dash-action-icon"><app-icon name="bar-chart" [size]="18" /></span>
            <span>Generate Report</span>
          </a>
        </div>
      </div>
    }  `,
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