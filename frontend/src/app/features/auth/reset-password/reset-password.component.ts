import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <h2 class="auth-title">New password</h2>
    <form (ngSubmit)="submit(f)" #f="ngForm">
      <div class="form-group">
        <label>Reset token</label>
        <input type="text" class="form-control" name="token" [(ngModel)]="token" required #tokenCtrl="ngModel" />
        @if (f.submitted && tokenCtrl.invalid) {
          <div class="field-error">Reset token is required</div>
        }
      </div>
      <div class="form-group">
        <label>New password</label>
        <div class="password-box">
          <input
            [type]="showPassword ? 'text' : 'password'"
            class="form-control"
            name="password"
            [(ngModel)]="password"
            minlength="8"
            required
            #passwordCtrl="ngModel" />
          <button
            type="button"
            class="password-toggle"
            (click)="showPassword = !showPassword"
            [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
            <app-icon [name]="showPassword ? 'eye-off' : 'eye'" [size]="16" />
          </button>
        </div>
        @if (f.submitted && passwordCtrl.invalid) {
          <div class="field-error">Password must be at least 8 characters</div>
        }
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
  showPassword = false;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly toasts: ToastService
  ) {}

  submit(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
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