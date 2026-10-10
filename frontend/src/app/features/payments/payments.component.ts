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
      <div class="table-responsive pay-table">
        <table class="table">
          <thead><tr><th>Receipt</th><th>Student</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of rows; track p.id) {
              <tr>
                <td data-label="Receipt" class="c-head">{{ p.receiptNo }}</td>
                <td data-label="Student">{{ p.studentName }} <small>{{ p.admissionNo }}</small></td>
                <td data-label="Invoice">{{ p.invoiceNo }}</td>
                <td data-label="Amount" class="c-amount">{{ money(p.amount) }}</td>
                <td data-label="Method">{{ p.method }}</td>
                <td data-label="Date">{{ p.paidOn | date: 'mediumDate' }}</td>
                <td data-label="Status"><span class="pill" [class.ok]="p.status === 'successful'" [class.warn]="p.status !== 'successful'">{{ p.status }}</span></td>
                <td class="actions c-actions">
                  <button class="btn btn-sm btn-ghost" (click)="printReceipt(p)"><app-icon name="file-text" [size]="14" /> Receipt</button>
                  @if (canRefund && p.status === 'successful') {
                    <button class="btn btn-sm btn-ghost" (click)="openRefund(p)">Refund</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr class="empty-row"><td colspan="8" class="empty">{{ loading ? 'Loading…' : 'No payments found' }}</td></tr>
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
      <div class="table-responsive pay-table">
        <table class="table">
          <thead><tr><th>Receipt</th><th>Student</th><th>Refund</th><th>Of payment</th><th>Reason</th><th>Requested</th><th></th></tr></thead>
          <tbody>
            @for (r of pending; track r.id) {
              <tr>
                <td data-label="Receipt" class="c-head">{{ r.receiptNo }}</td>
                <td data-label="Student">{{ r.studentName }} <small>{{ r.admissionNo }}</small></td>
                <td data-label="Refund" class="c-amount">{{ money(r.amount) }} <small>({{ r.method }})</small></td>
                <td data-label="Of payment">{{ money(r.paymentAmount) }}</td>
                <td data-label="Reason">{{ r.reason }}</td>
                <td data-label="Requested">{{ r.createdAt | date: 'medium' }}</td>
                <td class="actions c-actions">
                  @if (canApprove && !mine(r)) {
                    <button class="btn btn-sm btn-primary" [disabled]="busy" (click)="decide(r, 'approve')">Approve</button>
                    <button class="btn btn-sm btn-ghost" [disabled]="busy" (click)="decide(r, 'reject')">Reject</button>
                  } @else if (mine(r)) {
                    <small>Waiting for someone else to approve</small>
                  }
                </td>
              </tr>
            } @empty {
              <tr class="empty-row"><td colspan="7" class="empty">No pending refund requests</td></tr>
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
    :host { display: block; min-width: 0; max-width: 100%; }
    .tabs { display: flex; gap: .5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .filters { display: flex; gap: .5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .filters .form-control { flex: 1 1 200px; max-width: 280px; min-width: 0; }
    .actions { display: flex; gap: .35rem; flex-wrap: wrap; }
    .empty { text-align: center; opacity: .7; padding: 1.5rem; }
    .pill { display: inline-block; padding: .1rem .55rem; border-radius: 999px; font-size: .75rem; font-weight: 600; text-transform: capitalize; }
    .pill.ok { background: rgba(22,163,74,.14); color: #15803d; }
    .pill.warn { background: rgba(245,158,11,.18); color: #b45309; }
    .pay-table small { opacity: .65; }
    .pagination-bar { display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; margin-top: .75rem; }
    /* Phones: each row becomes a card, so nothing is wider than the screen. */
    @media (max-width: 760px) {
      .filters .form-control { max-width: none; flex-basis: 100%; }
      .pay-table { overflow-x: visible; }
      .pay-table table, .pay-table tbody, .pay-table tr, .pay-table td { display: block; width: 100%; }
      .pay-table thead { display: none; }
      .pay-table tr { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: .65rem .85rem; margin-bottom: .75rem; box-shadow: var(--shadow); }
      .pay-table tbody td { border: 0; padding: .3rem 0; display: flex; justify-content: space-between; gap: 1rem; text-align: right; overflow-wrap: anywhere; }
      .pay-table td::before { content: attr(data-label); font-weight: 600; opacity: .6; text-align: left; flex: 0 0 auto; }
      .pay-table td.c-head { font-weight: 700; font-size: 1rem; border-bottom: 1px solid var(--border); padding-bottom: .5rem; margin-bottom: .25rem; }
      .pay-table td.c-amount { font-weight: 700; }
      .pay-table td.c-actions { justify-content: flex-start; padding-top: .6rem; }
      .pay-table td.c-actions::before, .pay-table td.c-head::before { content: none; }
      .pay-table td.c-actions .btn { flex: 1 1 auto; justify-content: center; }
      .pay-table tr.empty-row { border: 0; box-shadow: none; background: none; }
      .pay-table tr.empty-row td::before { content: none; }
      .pay-table tr.empty-row td { justify-content: center; }
    }
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
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { this.toasts.error('Allow pop-ups to print the receipt'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">Preparing receipt…</p>');
    this.api.get<Record<string, string>>('/settings/public').subscribe({
      next: (r) => this.writeReceipt(w, p, r?.data ?? {}),
      error: () => this.writeReceipt(w, p, {}),
    });
  }

  private writeReceipt(w: Window, p: any, cfg: Record<string, string>): void {
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const school = esc(cfg['schoolName'] || 'School');
    const contact = [cfg['address'], cfg['phone'], cfg['contactEmail'] || cfg['email']].filter(Boolean).map(esc).join(' · ');
    const date = new Date(p.paidOn).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const refunded = p.status === 'refunded';
    const row = (k: string, v: unknown) => v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '';
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(p.receiptNo)}</title>
<style>
  @page { size: A5; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
  .sheet { max-width: 560px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; position: relative; }
  .head { background: #1e3a8a; color: #fff; padding: 20px 24px; text-align: center; }
  .head h1 { margin: 0; font-size: 22px; letter-spacing: .5px; }
  .head p { margin: 4px 0 0; font-size: 12px; opacity: .85; }
  .title { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; border-bottom: 1px dashed #cbd5e1; }
  .title b { font-size: 15px; letter-spacing: 2px; text-transform: uppercase; }
  .title span { font-size: 13px; color: #475569; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 9px 24px; text-align: left; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
  th { width: 38%; color: #64748b; font-weight: 600; }
  .total { background: #eff6ff; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; }
  .total span { font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 1px; }
  .total b { font-size: 26px; color: #1e3a8a; }
  .stamp { position: absolute; right: 28px; top: 120px; transform: rotate(-14deg); border: 3px solid ${refunded ? '#b45309' : '#15803d'}; color: ${refunded ? '#b45309' : '#15803d'}; padding: 2px 14px; font-size: 22px; font-weight: 800; letter-spacing: 3px; border-radius: 6px; opacity: .75; }
  .sign { display: flex; justify-content: space-between; padding: 44px 24px 16px; gap: 24px; }
  .sign div { flex: 1; border-top: 1px solid #94a3b8; text-align: center; font-size: 12px; color: #64748b; padding-top: 6px; }
  .foot { text-align: center; font-size: 11px; color: #94a3b8; padding: 0 24px 16px; }
  .noprint { text-align: center; margin: 16px; }
  @media print { body { padding: 0; } .noprint { display: none; } .sheet { border: 1px solid #94a3b8; } }
</style></head><body>
<div class="sheet">
  <div class="head"><h1>${school}</h1>${contact ? `<p>${contact}</p>` : ''}</div>
  <div class="title"><b>Fee Receipt</b><span>No. ${esc(p.receiptNo)}</span></div>
  <div class="stamp">${refunded ? 'REFUNDED' : 'PAID'}</div>
  <table>
    ${row('Student', p.studentName)}${row('Admission no.', p.admissionNo)}${row('Invoice', p.invoiceNo)}
    ${row('Date', date)}${row('Payment method', String(p.method || '').toUpperCase())}${row('Reference', p.reference)}
  </table>
  <div class="total"><span>Amount received</span><b>${esc(this.money(p.amount))}</b></div>
  <div class="sign"><div>Received by</div><div>Parent / Guardian</div></div>
  <div class="foot">This is a computer-generated receipt. Thank you.</div>
</div>
<div class="noprint"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer">Print / Save as PDF</button></div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`);
    w.document.close();
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
