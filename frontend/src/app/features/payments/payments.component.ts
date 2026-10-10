import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { formatMoney } from '../../core/utils/currency';
import { IconComponent } from '../../shared/components/icon/icon.component';

/** Payments list + refund requests (request -> a different person approves). */
@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Payments</h1>
        <p class="page-subtitle">All received payments, receipts and refund requests.</p>
      </div>
    </div>

    <div class="tabs">
      <button class="btn btn-sm" [class.btn-primary]="tab === 'all'" [class.btn-ghost]="tab !== 'all'" (click)="tab = 'all'">All payments</button>
      @if (canRefundView) {
        <button class="btn btn-sm" [class.btn-primary]="tab === 'refunds'" [class.btn-ghost]="tab !== 'refunds'" (click)="tab = 'refunds'; loadRefunds()">
          Refund requests @if (pending.length) { ({{ pending.length }}) }
        </button>
      }
    </div>

    @if (tab === 'all') {
      <div class="filters">
        <input class="form-control" placeholder="Search receipt, reference…" [(ngModel)]="search" (ngModelChange)="page = 1; load()" />
        <select class="form-control" [(ngModel)]="method" (ngModelChange)="page = 1; load()">
          <option value="">All methods</option>
          @for (m of METHODS; track m) { <option [value]="m">{{ m }}</option> }
        </select>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Receipt</th><th>Student</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of rows; track p.id) {
              <tr>
                <td>{{ p.receiptNo }}</td>
                <td>{{ p.studentName }} <small>{{ p.admissionNo }}</small></td>
                <td>{{ p.invoiceNo }}</td>
                <td>{{ money(p.amount) }}</td>
                <td>{{ p.method }}</td>
                <td>{{ p.paidOn | date: 'mediumDate' }}</td>
                <td>{{ p.status }}</td>
                <td class="actions">
                  <button class="btn btn-sm btn-ghost" (click)="printReceipt(p)"><app-icon name="file-text" [size]="14" /> Receipt</button>
                  @if (canRefund && p.status === 'successful') {
                    <button class="btn btn-sm btn-ghost" (click)="openRefund(p)">Refund</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty">{{ loading ? 'Loading…' : 'No payments found' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <span>{{ total }} payment(s) — page {{ page }} of {{ totalPages }}</span>
        <div>
          <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="page = page - 1; load()"><app-icon name="chevron-left" [size]="14" /></button>
          <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="page = page + 1; load()"><app-icon name="chevron-right" [size]="14" /></button>
        </div>
      </div>
    } @else {
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Receipt</th><th>Student</th><th>Refund</th><th>Of payment</th><th>Reason</th><th>Requested</th><th></th></tr></thead>
          <tbody>
            @for (r of pending; track r.id) {
              <tr>
                <td>{{ r.receiptNo }}</td>
                <td>{{ r.studentName }} <small>{{ r.admissionNo }}</small></td>
                <td>{{ money(r.amount) }} ({{ r.method }})</td>
                <td>{{ money(r.paymentAmount) }}</td>
                <td>{{ r.reason }}</td>
                <td>{{ r.createdAt | date: 'medium' }}</td>
                <td class="actions">
                  @if (canApprove && !mine(r)) {
                    <button class="btn btn-sm btn-primary" [disabled]="busy" (click)="decide(r, 'approve')">Approve</button>
                    <button class="btn btn-sm btn-ghost" [disabled]="busy" (click)="decide(r, 'reject')">Reject</button>
                  } @else if (mine(r)) {
                    <small>Waiting for someone else to approve</small>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">No pending refund requests</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (refundTarget) {
      <div class="modal-backdrop" (click)="refundTarget = null">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title">Request refund — {{ refundTarget.receiptNo }}</div>
            <button type="button" class="modal-close" (click)="refundTarget = null" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <form (ngSubmit)="submitRefund()">
            <div class="form-group">
              <label>Amount (paid {{ money(refundTarget.amount) }})</label>
              <input type="number" min="0.01" step="0.01" [max]="refundTarget.amount" class="form-control" [(ngModel)]="refundForm.amount" name="amount" required />
            </div>
            <div class="form-group">
              <label>Refund method</label>
              <select class="form-control" [(ngModel)]="refundForm.method" name="method">
                @for (m of METHODS; track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </div>
            <div class="form-group">
              <label>Reason (required)</label>
              <textarea class="form-control" rows="2" [(ngModel)]="refundForm.reason" name="reason" required minlength="3"></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="refundTarget = null">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy || !valid()">{{ busy ? 'Sending…' : 'Send for approval' }}</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: .5rem; margin-bottom: 1rem; }
    .filters { display: flex; gap: .5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .filters .form-control { max-width: 260px; }
    .actions { display: flex; gap: .35rem; flex-wrap: wrap; }
    .empty { text-align: center; opacity: .7; padding: 1.5rem; }
  `],
})
export class PaymentsComponent implements OnInit {
  readonly METHODS = ['cash', 'bank', 'card', 'cheque', 'online'];
  tab: 'all' | 'refunds' = 'all';
  rows: any[] = [];
  pending: any[] = [];
  page = 1; limit = 15; total = 0; loading = false; busy = false;
  search = ''; method = '';
  refundTarget: any = null;
  refundForm: any = { amount: 0, method: 'cash', reason: '' };

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService,
  ) {}

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  get canRefund(): boolean { return this.perms.hasPermission('refunds:create'); }
  get canApprove(): boolean { return this.perms.hasPermission('refunds:approve'); }
  get canRefundView(): boolean { return this.canRefund || this.canApprove; }
  money(v: unknown): string { return formatMoney(v); }
  mine(r: any): boolean { return Number(r.requestedBy) === Number((this.auth.user as any)?.id) && !this.perms.hasPermission('*'); }

  ngOnInit(): void { this.load(); if (this.canRefundView) this.loadRefunds(); }

  load(): void {
    this.loading = true;
    const q: any = { page: this.page, limit: this.limit };
    if (this.search.trim()) q.search = this.search.trim();
    if (this.method) q['filter[method]'] = this.method;
    this.api.get<any[]>('/payments', q).subscribe({
      next: (r) => { this.rows = r?.data ?? []; this.total = r?.meta?.total ?? this.rows.length; this.loading = false; },
      error: () => (this.loading = false),
    });
  }
  loadRefunds(): void {
    this.api.get<any[]>('/payments/refunds/pending').subscribe({ next: (r) => (this.pending = r?.data ?? []), error: () => {} });
  }

  printReceipt(p: any): void {
    this.api.get<any>(`/payments/receipts/${p.id}`).subscribe({
      next: (r) => {
        const rc = r?.data ?? {};
        const w = window.open('', '_blank', 'width=480,height=640');
        if (!w) { this.toasts.error('Allow pop-ups to print the receipt'); return; }
        const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
        w.document.write(`<html><body style="font-family:sans-serif;padding:24px"><h2>Payment receipt</h2>
          <p>Receipt: <b>${esc(p.receiptNo || rc.receiptNo)}</b></p><p>Student: ${esc(p.studentName)} (${esc(p.admissionNo)})</p>
          <p>Invoice: ${esc(p.invoiceNo)}</p><p>Amount: <b>${esc(this.money(p.amount))}</b> (${esc(p.method)})</p>
          <p>Date: ${esc(new Date(p.paidOn).toLocaleDateString())}</p></body></html>`);
        w.document.close(); w.focus(); w.print();
      },
      error: () => this.toasts.error('Could not load the receipt'),
    });
  }

  openRefund(p: any): void {
    this.refundTarget = p;
    this.refundForm = { amount: Number(p.amount), method: p.method || 'cash', reason: '' };
  }
  valid(): boolean {
    const a = Number(this.refundForm.amount);
    return a > 0 && a <= Number(this.refundTarget?.amount) && String(this.refundForm.reason).trim().length >= 3;
  }
  submitRefund(): void {
    if (!this.valid()) return;
    this.busy = true;
    this.api.post(`/payments/${this.refundTarget.id}/refund`, { ...this.refundForm, reason: this.refundForm.reason.trim() }).subscribe({
      next: () => { this.busy = false; this.refundTarget = null; this.toasts.success('Refund sent for approval'); this.loadRefunds(); },
      error: (err) => { this.busy = false; this.toasts.error(err?.error?.message || 'Could not request refund'); },
    });
  }
  decide(r: any, action: 'approve' | 'reject'): void {
    this.busy = true;
    this.api.patch(`/payments/${r.paymentId}/refunds/${r.id}/${action}`, {}).subscribe({
      next: () => { this.busy = false; this.toasts.success(action === 'approve' ? 'Refund approved' : 'Refund rejected'); this.loadRefunds(); this.load(); },
      error: (err) => { this.busy = false; this.toasts.error(err?.error?.message || 'Action failed'); },
    });
  }
}
