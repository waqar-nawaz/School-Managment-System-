import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <div class="auth-head">
      <h2 class="auth-title">Set a new password</h2>
      <p class="auth-sub">Choose a strong password to secure your account</p>
    </div>
    <form (ngSubmit)="submit(f)" #f="ngForm">
      @if (!tokenFromUrl) {
        <div class="form-group">
          <label>Reset token</label>
          <input type="text" class="form-control" name="token" [(ngModel)]="token" required #tokenCtrl="ngModel" />
          @if (f.submitted && tokenCtrl.invalid) {
            <div class="field-error">Reset token is required</div>
          }
        </div>
      }
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
      <div class="form-group">
        <label>Confirm new password</label>
        <div class="password-box">
          <input
            [type]="showPassword ? 'text' : 'password'"
            class="form-control"
            name="confirm"
            [(ngModel)]="confirmPassword"
            required
            #confirmCtrl="ngModel" />
          <button
            type="button"
            class="password-toggle"
            (click)="showPassword = !showPassword"
            [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
            <app-icon [name]="showPassword ? 'eye-off' : 'eye'" [size]="16" />
          </button>
        </div>
        @if (f.submitted && (confirmCtrl.invalid || pwMismatch)) {
          <div class="field-error">{{ confirmCtrl.invalid ? 'Please confirm your new password' : 'Passwords do not match' }}</div>
        }
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" [disabled]="busy">
        <app-icon name="check" [size]="16" /> {{ busy ? 'Saving…' : 'Save password' }}
      </button>
    </form>
    <p class="auth-actions">
      <a routerLink="/auth/login">Back to sign in</a>
    </p>
  `,
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  password = '';
  confirmPassword = '';
  busy = false;
  showPassword = false;
  pwMismatch = false;
  tokenFromUrl = false;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly toasts: ToastService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.token = token;
      this.tokenFromUrl = true;
    }
  }

  submit(form: NgForm): void {
    this.pwMismatch = false;
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.pwMismatch = true;
      return;
    }
    this.busy = true;
    this.api.post('/auth/reset-password', { token: this.token, newPassword: this.password }).subscribe({
      next: () => {
        this.busy = false;
        this.toasts.success('Password updated. Please sign in.');
        this.router.navigate(['/auth/login']);
      },
      error: () => {
        this.busy = false;
      },
    });
  }
}
