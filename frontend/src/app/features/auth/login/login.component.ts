import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <h2 class="auth-title">Sign in</h2>
    <form (ngSubmit)="submit(f)" #f="ngForm">
      <div class="form-group">
        <label>Email or username</label>
        <input type="text" class="form-control" name="identifier" [(ngModel)]="model.identifier" required #identifier="ngModel" />
        @if (f.submitted && identifier.invalid) {
          <div class="field-error">Email or username is required</div>
        }
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" class="form-control" name="password" [(ngModel)]="model.password" required #password="ngModel" />
        @if (f.submitted && password.invalid) {
          <div class="field-error">Password is required</div>
        }
      </div>
      <div class="form-row">
        <label class="form-check">
          <input type="checkbox" class="form-checkbox" name="rememberMe" [(ngModel)]="model.rememberMe" />
          Remember me
        </label>
      </div>
      <button type="submit" class="btn btn-primary btn-block" [disabled]="busy">
        <app-icon name="log-in" [size]="16" /> {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
    <p class="auth-actions">
      <a routerLink="/auth/forgot-password">Forgot password?</a>
    </p>
  `,
})
export class LoginComponent {
  model = { identifier: '', password: '', rememberMe: true };
  busy = false;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toasts: ToastService
  ) {}

  submit(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy = true;
    this.auth.login(this.model).subscribe({
      next: () => {
        this.busy = false;
        this.toasts.success('Welcome back');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.busy = false;
        this.toasts.error(err?.error?.message || 'Login failed');
      },
    });
  }
}