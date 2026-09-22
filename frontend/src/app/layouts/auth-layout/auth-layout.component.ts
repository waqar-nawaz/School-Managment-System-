import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet, IconComponent],
  template: `
    <div class="auth-shell">
      <section class="auth-hero">
        <div class="auth-brand">
          <span class="brand-logo"><app-icon name="graduation" [size]="26" /></span>
          <div class="brand-text">
            <strong>EduSuite</strong>
            <span>School Management System</span>
          </div>
        </div>

        <div class="auth-hero-copy">
          <h2>Everything your school needs, in one place.</h2>
          <p>Attendance, fees, exams, transport and library — built for modern institutions.</p>
        </div>

        <ul class="auth-features">
          <li><span class="feat-ico"><app-icon name="check-square" [size]="16" /></span> Daily attendance &amp; timetables</li>
          <li><span class="feat-ico"><app-icon name="credit-card" [size]="16" /></span> Fees, invoices &amp; payments</li>
          <li><span class="feat-ico"><app-icon name="award" [size]="16" /></span> Exams, results &amp; report cards</li>
          <li><span class="feat-ico"><app-icon name="truck" [size]="16" /></span> Transport, hostel &amp; library</li>
        </ul>
      </section>

      <section class="auth-panel">
        <div class="auth-mobile-brand">
          <span class="brand-logo"><app-icon name="graduation" [size]="22" /></span>
          <strong>EduSuite</strong>
        </div>
        <div class="auth-card">
          <router-outlet />
        </div>
        <p class="auth-footer">© {{ year }} EduSuite. All rights reserved.</p>
      </section>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly year = new Date().getFullYear();
}
