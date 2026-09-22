import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <h2 class="auth-title">New password</h2>
    <form (ngSubmit)="submit()" #f="ngForm">
      <div class="form-group">
        <label>Reset token</label>
        <input type="text" class="form-control" name="token" [(ngModel)]="token" required />
      </div>
      <div class="form-group">
        <label>New password</label>
        <input type="password" class="form-control" name="password" [(ngModel)]="password" minlength="8" required />
      </div>
      <button type="submit" class="btn btn-primary btn-block" [disabled]="busy">{{ busy ? 'Saving…' : 'Save password' }}</button>
    </form>
    <p class="auth-actions">
      <a routerLink="/auth/login">Back to sign in</a>
    </p>
  `,
})
export class ResetPasswordComponent {
  token = '';
  password = '';
  busy = false;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly toasts: ToastService
  ) {}

  submit(): void {
    if (!this.token || this.password.length < 8) return;
    this.busy = true;
    this.api.post('/auth/reset-password', { token: this.token, password: this.password }).subscribe({
      next: () => {
        this.busy = false;
        this.toasts.success('Password updated. Please sign in.');
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        this.busy = false;
        this.toasts.error(err?.error?.message || 'Reset failed');
      },
    });
  }
}