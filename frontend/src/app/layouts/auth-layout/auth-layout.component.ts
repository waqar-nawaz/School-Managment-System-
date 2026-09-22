import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="auth-shell">
      <div class="auth-brand">
        <div class="brand-badge">🏫</div>
        <h1>School Management System</h1>
        <p>Attendance, fees, exams, transport and more — everything in one place.</p>
      </div>
      <div class="auth-card">
        <router-outlet />
      </div>
    </div>
  `,
})
export class AuthLayoutComponent {}