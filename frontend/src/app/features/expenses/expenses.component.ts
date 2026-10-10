import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { formatMoney } from '../../core/utils/currency';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface Summary {
  month: string; spent: number;
  toApprove: { count: number; total: number }; toPay: { count: number; total: number }; paid: { count: number; total: number };
  byCategory: { category: string; total: number }[];
}

/** School expenses in the order they really happen: record -> someone else approves -> pay. */
@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Expenses</h1>
        <p class="page-subtitle">Record what the school spends. A different person approves it, then it is marked as paid.</p>
      </div>
      <div class="page-actions">
        <input type="month" class="form-control" style="width:auto" [(ngModel)]="month" (ngModelChange)="loadSummary()" aria-label="Month" />
        @if (canCreate) { <button class="btn btn-primary" (click)="openForm()"><app-icon name="plus" [size]="14" /> Add expense</button> }
      </div>
    </div>

    @if (summary) {
      <div class="summary-row">
        <div class="mini-card"><span class="stat-label">Spent this month</span><span class="stat-value">{{ money(summary.spent) }}</span></div>
        <div class="mini-card"><span class="stat-label">Waiting for approval</span><span class="stat-value">{{ summary.toApprove.count }}</span><small>{{ money(summary.toApprove.total) }}</small></div>
        <div class="mini-card"><span class="stat-label">Approved, to pay</span><span class="stat-value">{{ summary.toPay.count }}</span><small>{{ money(summary.toPay.total) }}</small></div>
        <div class="mini-card"><span class="stat-label">Paid</span><span class="stat-value stat-ok">{{ summary.paid.count }}</span><small>{{ money(summary.paid.total) }}</small></div>
      </div>
      @if (summary.byCategory.length) {
        <div class="card cat-card">
          <strong>Where the money went ({{ summary.month }})</strong>
          @for (c of summary.byCategory; track c.category) {
            <div class="cat-row">
              <span class="cat-name">{{ c.category }}</span>
              <span class="cat-bar"><span [style.width.%]="pct(c.total)"></span></span>
              <span class="cat-val">{{ money(c.total) }}</span>
            </div>
          }
        </div>
      }
    }

    <div class="filters">
      <div class="chips">
        @for (s of STATUSES; track s.v) {
          <button class="chip" [class.active]="status === s.v" (click)="status = s.v; page = 1; load()">{{ s.l }}</button>
        }
      </div>
      <input class="form-control" placeholder="Search title or category…" [(ngModel)]="search" (ngModelChange)="page = 1; load()" />
    </div>

    <div class="card">
      <div class="table-responsive">
        <table class="table table-cards">
          <thead><tr><th>Expense</th><th>Category</th><th>Date</th><th style="text-align:right">Amount</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>
            @for (e of rows; track e.id) {
              <tr>
                <td class="cell-first" data-label="Expense">{{ e.title }}@if (e.notes) { <div class="form-hint" style="margin:0;font-weight:400">{{ e.notes }}</div> }</td>
                <td data-label="Category">{{ e.category || '—' }}</td>
                <td data-label="Date">{{ e.expensedOn | date: 'MMM d, y' }}</td>
                <td data-label="Amount" style="text-align:right"><strong>{{ money(e.amount) }}</strong></td>
                <td data-label="Status"><span class="badge badge-{{ badge(e.status) }}">{{ label(e.status) }}</span></td>
                <td class="cell-actions" style="text-align:right">
                  <div class="acts">
                    @if (e.status === 'draft') {
                      @if (canApprove && !mine(e)) { <button class="btn btn-sm btn-primary" [disabled]="busy" (click)="setStatus(e, 'approved')">Approve</button> }
                      @if (canApprove && !mine(e)) { <button class="btn btn-sm btn-ghost" [disabled]="busy" (click)="setStatus(e, 'rejected')">Reject</button> }
                      @if (canApprove && mine(e)) { <small class="muted">Waiting for someone else to approve</small> }
                      @if (canUpdate) { <button class="btn btn-sm btn-ghost" (click)="openForm(e)"><app-icon name="edit" [size]="14" /> Edit</button> }
                      @if (canDelete) { <button class="btn btn-sm btn-ghost" aria-label="Delete" (click)="toDelete = e"><app-icon name="trash" [size]="14" /></button> }
                    }
                    @if (e.status === 'approved') {
                      @if (canPay) { <button class="btn btn-sm btn-primary" [disabled]="busy" (click)="setStatus(e, 'paid')">Mark paid</button> }
                      @if (canUpdate) { <button class="btn btn-sm btn-ghost" [disabled]="busy" (click)="toCancel = e">Cancel</button> }
                    }
                    @if (e.status === 'rejected' && canUpdate) {
                      <button class="btn btn-sm btn-ghost" [disabled]="busy" (click)="setStatus(e, 'draft')">Send again</button>
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty-cell">{{ loading ? 'Loading…' : 'No expenses found.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (total > limit) {
        <div class="pagination-bar">
          <span>{{ total }} expense(s) — page {{ page }} of {{ totalPages }}</span>
          <div>
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="page = page - 1; load()"><app-icon name="chevron-left" [size]="14" /></button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="page = page + 1; load()"><app-icon name="chevron-right" [size]="14" /></button>
          </div>
        </div>
      }
    </div>

    @if (formOpen) {
      <div class="modal-backdrop" (click)="formOpen = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div class="modal-title">{{ editing ? 'Edit expense' : 'Add expense' }}</div>
            <button type="button" class="modal-close" (click)="formOpen = false" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <form (ngSubmit)="save(f)" #f="ngForm">
            <div class="form-group">
              <label>What was it for?</label>
              <input class="form-control" [(ngModel)]="form.title" name="title" required maxlength="180" placeholder="e.g. Printer ink for office" />
            </div>
            <div class="form-group">
              <label>Category</label>
              <input class="form-control" [(ngModel)]="form.category" name="category" required list="exp-cats" placeholder="Pick or type" />
              <datalist id="exp-cats">@for (c of CATEGORIES; track c) { <option [value]="c"></option> }</datalist>
            </div>
            <div class="form-group">
              <label>Amount</label>
              <input type="number" min="0.01" step="0.01" class="form-control" [(ngModel)]="form.amount" name="amount" required />
            </div>
            <div class="form-group">
              <label>Date</label>
              <input type="date" class="form-control" [(ngModel)]="form.expensedOn" name="expensedOn" [max]="todayStr" required />
            </div>
            <div class="form-group">
              <label>Notes (optional)</label>
              <textarea class="form-control" rows="2" [(ngModel)]="form.notes" name="notes"></textarea>
            </div>
            @if (formError) { <div class="field-error">{{ formError }}</div> }
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="formOpen = false">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy || f.invalid || !(form.amount > 0)">{{ busy ? 'Saving…' : 'Save' }}</button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (toDelete) {
      <app-confirm-dialog title="Delete this expense?" [message]="'“' + toDelete.title + '” will be removed. This cannot be undone.'" confirmLabel="Delete" [danger]="true" (confirm)="doDelete()" (close)="toDelete = null" />
    }
    @if (toCancel) {
      <app-confirm-dialog title="Cancel this expense?" [message]="'“' + toCancel.title + '” was approved. Cancelling removes it from spending and cannot be undone.'" confirmLabel="Cancel expense" [danger]="true" (confirm)="doCancel()" (close)="toCancel = null" />
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .6rem; margin-bottom: 1rem; }
    .mini-card small { opacity: .7; }
    .cat-card { padding: 1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: .5rem; }
    .cat-row { display: grid; grid-template-columns: minmax(80px, 140px) 1fr auto; gap: .6rem; align-items: center; font-size: .9rem; }
    .cat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cat-bar { height: 8px; background: rgba(127,127,127,.18); border-radius: 99px; overflow: hidden; }
    .cat-bar span { display: block; height: 100%; background: var(--primary); border-radius: 99px; }
    .filters { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
    .filters .form-control { flex: 1 1 220px; max-width: 320px; min-width: 0; }
    .chips { display: flex; gap: .4rem; flex-wrap: wrap; }
    .chip { border: 1px solid var(--border); background: var(--surface); color: inherit; padding: .3rem .8rem; border-radius: 99px; font-size: .85rem; cursor: pointer; }
    .chip.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .acts { display: flex; gap: .35rem; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
    .muted { opacity: .65; }
    @media (max-width: 760px) {
      .page-actions { width: 100%; display: flex; gap: .5rem; flex-wrap: wrap; }
      .filters .form-control { max-width: none; flex-basis: 100%; }
      .acts { justify-content: flex-start; width: 100%; }
      .acts .btn { flex: 1 1 auto; justify-content: center; }
      .cat-row { grid-template-columns: 90px 1fr auto; }
    }
  `],
})
export class ExpensesComponent implements OnInit {
  readonly STATUSES = [
    { v: '', l: 'All' }, { v: 'draft', l: 'Needs approval' }, { v: 'approved', l: 'To pay' },
    { v: 'paid', l: 'Paid' }, { v: 'rejected', l: 'Rejected' }, { v: 'cancelled', l: 'Cancelled' },
  ];
  readonly CATEGORIES = ['Stationery', 'Utilities', 'Maintenance', 'Supplies', 'Transport', 'Events', 'Repairs', 'Rent', 'Other'];
  readonly todayStr = new Date().toLocaleDateString('en-CA');

  month = new Date().toISOString().slice(0, 7);
  summary: Summary | null = null;
  rows: any[] = [];
  status = ''; search = '';
  page = 1; limit = 15; total = 0;
  loading = false; busy = false;

  formOpen = false; editing: any = null; formError = '';
  form: any = {};
  toDelete: any = null; toCancel: any = null;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService,
  ) {}

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  get canCreate(): boolean { return this.perms.hasPermission('expenses:create'); }
  get canUpdate(): boolean { return this.perms.hasPermission('expenses:update'); }
  get canDelete(): boolean { return this.perms.hasPermission('expenses:delete'); }
  get canApprove(): boolean { return this.perms.hasPermission('expenses:approve'); }
  get canPay(): boolean { return this.perms.hasPermission('expenses:pay'); }

  money(v: unknown): string { return formatMoney(v); }
  pct(v: number): number { const max = Math.max(...(this.summary?.byCategory ?? []).map((c) => c.total), 1); return Math.max(3, (v / max) * 100); }
  badge(s: string): string { return ({ draft: 'warning', approved: 'info', paid: 'success', rejected: 'danger', cancelled: 'neutral' } as Record<string, string>)[s] ?? 'neutral'; }
  label(s: string): string { return ({ draft: 'Needs approval', approved: 'Approved', paid: 'Paid', rejected: 'Rejected', cancelled: 'Cancelled' } as Record<string, string>)[s] ?? s; }
  /** The person who recorded an expense cannot approve it (administrators can). */
  mine(e: any): boolean { return Number(e.createdBy) === Number((this.auth.user as any)?.id) && !this.perms.hasPermission('*'); }

  ngOnInit(): void { this.load(); this.loadSummary(); }

  load(): void {
    this.loading = true;
    const q: any = { page: this.page, limit: this.limit };
    if (this.search.trim()) q.q = this.search.trim();
    if (this.status) q['filter[status]'] = this.status;
    this.api.get<any[]>('/expenses', q).subscribe({
      next: (r) => { this.rows = r?.data ?? []; this.total = r?.meta?.total ?? this.rows.length; this.loading = false; },
      error: () => (this.loading = false),
    });
  }
  loadSummary(): void {
    if (!this.month) return;
    this.api.get<Summary>('/expenses/summary', { month: this.month }).subscribe({ next: (r) => (this.summary = r?.data ?? null), error: () => {} });
  }
  private refresh(): void { this.load(); this.loadSummary(); }

  openForm(e?: any): void {
    this.editing = e ?? null; this.formError = '';
    this.form = e
      ? { title: e.title, category: e.category, amount: Number(e.amount), expensedOn: String(e.expensedOn ?? '').slice(0, 10), notes: e.notes ?? '' }
      : { title: '', category: '', amount: null, expensedOn: this.todayStr, notes: '' };
    this.formOpen = true;
  }
  save(f: any): void {
    if (f.invalid || !(Number(this.form.amount) > 0)) { f.form.markAllAsTouched(); return; }
    this.busy = true; this.formError = '';
    const body = { ...this.form, title: String(this.form.title).trim(), category: String(this.form.category).trim(), amount: Number(this.form.amount), ...(this.editing ? {} : { status: 'draft' }) };
    const req = this.editing ? this.api.put(`/expenses/${this.editing.id}`, body) : this.api.post('/expenses', body);
    req.subscribe({
      next: () => { this.busy = false; this.formOpen = false; this.toasts.success(this.editing ? 'Expense updated' : 'Expense recorded, it now waits for approval'); this.refresh(); },
      error: (err) => { this.busy = false; this.formError = err?.error?.message || 'Could not save the expense'; },
    });
  }
  setStatus(e: any, status: string): void {
    this.busy = true;
    this.api.put(`/expenses/${e.id}`, { status }).subscribe({
      next: () => { this.busy = false; this.toasts.success(({ approved: 'Expense approved', rejected: 'Expense rejected', paid: 'Marked as paid', draft: 'Sent for approval again', cancelled: 'Expense cancelled' } as Record<string, string>)[status] ?? 'Updated'); this.refresh(); },
      error: (err) => { this.busy = false; this.toasts.error(err?.error?.message || 'Could not update the expense'); },
    });
  }
  doCancel(): void { const e = this.toCancel; this.toCancel = null; if (e) this.setStatus(e, 'cancelled'); }
  doDelete(): void {
    const e = this.toDelete; this.toDelete = null; if (!e) return;
    this.api.delete(`/expenses/${e.id}`).subscribe({
      next: () => { this.toasts.success('Expense deleted'); this.refresh(); },
      error: (err) => this.toasts.error(err?.error?.message || 'Could not delete the expense'),
    });
  }
}
