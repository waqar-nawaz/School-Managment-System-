import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { formatMoney } from '../../core/utils/currency';
import { printPayslip } from '../../shared/utils/payslip-print';
import { IconComponent } from '../../shared/components/icon/icon.component';

/** An employee's own salary slips. Only approved or paid months appear; nothing else is visible. */
@Component({
  selector: 'app-my-payslips',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">My payslips</h1>
        <p class="page-subtitle">{{ employee ? employee.name + ' · ' + employee.staffNo + (employee.designation ? ' · ' + employee.designation : '') : 'Your salary slips, newest first.' }}</p>
      </div>
    </div>
    <div class="card">
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Month</th><th style="text-align:right">Basic</th><th style="text-align:right">Allowances</th><th style="text-align:right">Deductions</th><th style="text-align:right">Net pay</th><th>Status</th><th style="width:110px;text-align:right"></th></tr></thead>
          <tbody>
            @for (p of items; track p.id) {
              <tr>
                <td><strong>{{ monthLabel(p.month) }}</strong></td>
                <td style="text-align:right">{{ money(p.basicSalary) }}</td>
                <td style="text-align:right">{{ money(p.allowances) }}</td>
                <td style="text-align:right">{{ money(p.deductions) }}</td>
                <td style="text-align:right"><strong>{{ money(p.netPay) }}</strong></td>
                <td><span class="badge badge-{{ p.status === 'paid' ? 'success' : 'info' }}">{{ p.status === 'paid' ? 'Paid' + (p.paidOn ? ' ' + (p.paidOn | date: 'MMM d') : '') : 'Approved' }}</span></td>
                <td style="text-align:right"><button class="btn btn-sm btn-ghost" (click)="print(p)"><app-icon name="file-text" [size]="14" /> Print</button></td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty-cell">{{ loading ? 'Loading…' : 'No payslips yet. A month appears here once the school has approved it.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class MyPayslipsComponent implements OnInit {
  items: any[] = [];
  employee: { name: string; staffNo: string; designation?: string } | null = null;
  loading = true;

  constructor(private readonly api: ApiService, private readonly toasts: ToastService) {}

  ngOnInit(): void {
    this.api.get<any>('/payroll/my').subscribe({
      next: (r) => { this.items = r?.data?.items ?? []; this.employee = r?.data?.employee ?? null; this.loading = false; },
      error: () => (this.loading = false),
    });
  }

  money(v: unknown): string { return formatMoney(v); }
  monthLabel(m: string): string {
    const d = new Date(`${m}-01T00:00:00Z`);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : m;
  }

  print(p: any): void {
    printPayslip(this.api, {
      month: p.month, name: this.employee?.name ?? '', staffNo: this.employee?.staffNo, designation: this.employee?.designation,
      basicSalary: p.basicSalary, allowances: p.allowances, deductions: p.deductions, netPay: p.netPay, status: p.status, paidOn: p.paidOn,
    }, () => this.toasts.error('Allow pop-ups to print.'));
  }
}
