import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

const STATUSES = ['enquiry', 'applied', 'test', 'interview', 'accepted', 'rejected', 'waitlisted', 'enrolled', 'withdrawn'];

@Component({
  selector: 'app-admissions',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Admissions</h1>
        <p class="page-subtitle">Application pipeline</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" (click)="load()">Refresh</button>
      </div>
    </div>

    <div class="stat-grid stat-grid-sm">
      @for (s of STATUSES; track s) {
        <div class="mini-card">
          <span class="stat-label">{{ s | titlecase }}</span>
          <span class="stat-value">{{ pipeline[s] || 0 }}</span>
        </div>
      }
    </div>

    <div class="card">
      <div class="card-toolbar">
        <input class="form-control" style="max-width:300px" placeholder="Search application…" [(ngModel)]="search" (ngModelChange)="load()" />
        <select class="form-control" style="max-width:180px" [(ngModel)]="status" (ngModelChange)="load()">
          <option value="">All statuses</option>
          @for (s of STATUSES; track s) { <option [value]="s">{{ s | titlecase }}</option> }
        </select>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>No</th><th>Student</th><th>Email</th><th>Phone</th><th>Applied To</th><th>Applied On</th><th>Status</th><th style="width:170px;text-align:right">Action</th></tr>
          </thead>
          <tbody>
            @for (app of apps; track app.id) {
              <tr>
                <td>{{ app.applicationNo }}</td>
                <td>{{ app.studentName }}</td>
                <td>{{ app.email }}</td>
                <td>{{ app.phone }}</td>
                <td>{{ app.appliedForClass || app.requestedClass || '—' }}</td>
                <td>{{ app.dateApplied | date: 'MMM d, y' }}</td>
                <td><span class="badge badge-{{ badgeOf(app.status) }}">{{ app.status }}</span></td>
                <td style="text-align:right">
                  <select class="form-control form-control-sm" [value]="app.status" (change)="transition(app, $event)">
                    @for (s of STATUSES; track s) { <option [value]="s">{{ s | titlecase }}</option> }
                  </select>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty-cell">No applications.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdmissionsComponent implements OnInit {
  readonly STATUSES = STATUSES;
  apps: any[] = [];
  pipeline: Record<string, number> = {};
  search = '';
  status = '';

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadPipeline();
  }

  load(): void {
    this.api.get<any[]>('/admissions', { page: 1, limit: 200, q: this.search, status: this.status }).subscribe({
      next: (res) => (this.apps = res?.data ?? []),
      error: () => {},
    });
  }

  loadPipeline(): void {
    this.api.get<Record<string, number>>('/admissions/stats/pipeline').subscribe({
      next: (res) => (this.pipeline = res?.data ?? {}),
      error: () => {},
    });
  }

  transition(app: any, event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    if (next === app.status) return;
    this.api.patch(`/admissions/${app.id}/status`, { status: next }).subscribe({
      next: () => {
        app.status = next;
        this.toasts.success(`Application moved to ${next}`);
        this.loadPipeline();
      },
      error: () => {},
    });
  }

  badgeOf(s: string): string {
    return ({ accepted: 'success', enrolled: 'success', rejected: 'danger', withdrawn: 'danger', waitlisted: 'warning', applied: 'info', test: 'info', interview: 'warning', enquiry: '' } as Record<string, string>)[s] ?? '';
  }
}