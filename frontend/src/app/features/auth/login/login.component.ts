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
    <div class="auth-head">
      <h2 class="auth-title">Welcome back</h2>
      <p class="auth-sub">Sign in to continue to your dashboard</p>
    </div>
    <form (ngSubmit)="submit(f)" #f="ngForm">
      <div class="form-group">
        <label>Email or username</label>
        <div class="input-icon">
          <span class="input-icon-lead"><app-icon name="user" [size]="16" /></span>
          <input
            type="text"
            class="form-control has-icon"
            name="identifier"
            [(ngModel)]="model.identifier"
            required
            #identifier="ngModel"
            autocomplete="username"
            placeholder="you@school.local" />
        </div>
        @if (f.submitted && identifier.invalid) {
          <div class="field-error">Email or username is required</div>
        }
      </div>
      <div class="form-group">
        <label>Password</label>
        <div class="password-box input-icon">
          <span class="input-icon-lead"><app-icon name="lock" [size]="16" /></span>
          <input
            [type]="showPassword ? 'text' : 'password'"
            class="form-control has-icon"
            name="password"
            [(ngModel)]="model.password"
            required
            #password="ngModel"
            autocomplete="current-password"
            placeholder="••••••••" />
          <button
            type="button"
            class="password-toggle"
            (click)="showPassword = !showPassword"
            [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
            <app-icon [name]="showPassword ? 'eye-off' : 'eye'" [size]="16" />
          </button>
        </div>
        @if (f.submitted && password.invalid) {
          <div class="field-error">Password is required</div>
        }
      </div>
      <div class="auth-row">
        <label class="form-check">
          <input type="checkbox" class="form-checkbox" name="rememberMe" [(ngModel)]="model.rememberMe" />
          Remember me
        </label>
        <a routerLink="/auth/forgot-password">Forgot password?</a>
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" [disabled]="busy">
        <app-icon name="log-in" [size]="16" /> {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  `,
})
export class LoginComponent {
  model = { identifier: '', password: '', rememberMe: true };
  busy = false;
  showPassword = false;

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