import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <div class="auth-head">
      <h2 class="auth-title">Reset password</h2>
      <p class="auth-sub">Enter your email and we'll send a reset link</p>
    </div>
    <form (ngSubmit)="submit(f)" #f="ngForm">
      <div class="form-group">
        <label>Email address</label>
        <input
          type="email"
          class="form-control"
          name="email"
          [(ngModel)]="email"
          required
          email
          autocomplete="email"
          placeholder="you@school.local"
          #emailCtrl="ngModel" />
        @if (f.submitted && emailCtrl.invalid) {
          <div class="field-error">Enter a valid email address</div>
        }
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" [disabled]="busy">
        <app-icon name="mail" [size]="16" /> {{ busy ? 'Sending…' : 'Send reset link' }}
      </button>
    </form>
    @if (sent) {
      <p class="form-hint">If an account exists for this email, a reset link has been sent.</p>
    }
    <p class="auth-actions">
      <a routerLink="/auth/login">Back to sign in</a>
    </p>
  `,
})
export class ForgotPasswordComponent {
  email = '';
  busy = false;
  sent = false;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  submit(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy = true;
    this.api.post('/auth/forgot-password', { email: this.email }).subscribe({
      next: () => {
        this.busy = false;
        this.sent = true;
      },
      error: (err) => {
        this.busy = false;
        this.sent = true;
        this.toasts.error(err?.error?.message || 'Request failed');
      },
    });
  }
}