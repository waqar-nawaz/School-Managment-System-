import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, CommonModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">My Profile</h1>
        <p class="page-subtitle">Account information and security</p>
      </div>
    </div>

    @if (auth.user$ | async; as u) {
      <div class="card">
        <h3 class="card-title">Account</h3>
        <dl class="detail-grid">
          <dt>Name</dt><dd>{{ u.firstName }} {{ u.lastName }}</dd>
          <dt>Email</dt><dd>{{ u.email }}</dd>
          <dt>Username</dt><dd>{{ u.username }}</dd>
          <dt>Role</dt><dd><span class="badge">{{ u.role }}</span></dd>
          <dt>Phone</dt><dd>{{ u.phone || '—' }}</dd>
          <dt>Branch</dt><dd>{{ u.branchId ?? '—' }}</dd>
          <dt>Last login</dt><dd>{{ u.lastLoginAt ? (u.lastLoginAt | date: 'medium') : '—' }}</dd>
        </dl>
      </div>
    }

    <div class="card">
      <h3 class="card-title">Change password</h3>
      <form (ngSubmit)="changePassword(f)" #f="ngForm" style="max-width:420px">
        <div class="form-group">
          <label>Current password</label>
          <input type="password" class="form-control" name="currentPassword" [(ngModel)]="pwForm.currentPassword" required #currentPassword="ngModel" />
          @if (f.submitted && currentPassword.invalid) {
            <div class="field-error">Current password is required</div>
          }
        </div>
        <div class="form-group">
          <label>New password (min 8 chars)</label>
          <input type="password" class="form-control" name="newPassword" [(ngModel)]="pwForm.newPassword" minlength="8" required #newPassword="ngModel" />
          @if (f.submitted && newPassword.invalid) {
            <div class="field-error">New password must be at least 8 characters</div>
          }
        </div>
        <div class="form-group">
          <label>Confirm new password</label>
          <input type="password" class="form-control" name="confirmPassword" [(ngModel)]="pwForm.confirmPassword" required #confirmPassword="ngModel" />
          @if (f.submitted && (confirmPassword.invalid || pwMismatch)) {
            <div class="field-error">{{ confirmPassword.invalid ? 'Please confirm your new password' : 'Passwords do not match' }}</div>
          }
        </div>
        <button type="submit" class="btn btn-primary" [disabled]="busy">
          <app-icon name="check" [size]="15" /> {{ busy ? 'Updating…' : 'Update password' }}
        </button>
      </form>
    </div>
  `,
})
export class ProfileComponent implements OnInit {
  pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  busy = false;
  pwMismatch = false;

  constructor(
    readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    if (!this.auth.user) this.auth.loadProfile().subscribe();
  }

  changePassword(form: NgForm): void {
    this.pwMismatch = false;
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    if (this.pwForm.newPassword !== this.pwForm.confirmPassword) {
      this.pwMismatch = true;
      return;
    }
    this.busy = true;
    this.api.post('/auth/change-password', this.pwForm).subscribe({
      next: () => {
        this.busy = false;
        this.toasts.success('Password changed');
        this.pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
      },
      error: () => {
        this.busy = false;
      },
    });
  }
}