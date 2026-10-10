import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { formatMoney } from '../../core/utils/currency';
import { printPayslip } from '../../shared/utils/payslip-print';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface Summary {
  month: string; count: number; draft: number; approved: number; paid: number; totalNet: number; totalPaid: number;
  totalPending: number; withoutSalary: number; notYetOnPayroll: number;
}

/** Monthly payroll in the order people actually do it: prepare -> check -> approve -> payslips -> pay. */
@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Payroll</h1>
        <p class="page-subtitle">Prepare a month, check the amounts, approve, create payslips, then mark as paid.</p>
      </div>
      <div class="page-actions">
        <input type="month" class="form-control" style="width:auto" [(ngModel)]="month" (ngModelChange)="reload()" [max]="maxMonth" aria-label="Month" />
      </div>
    </div>

    @if (summary) {
      <div class="summary-row">
        <div class="mini-card"><span class="stat-label">On payroll</span><span class="stat-value">{{ summary.count }}</span></div>
        <div class="mini-card"><span class="stat-label">Total net</span><span class="stat-value">{{ money(summary.totalNet) }}</span></div>
        <div class="mini-card"><span class="stat-label">Paid</span><span class="stat-value stat-ok">{{ money(summary.totalPaid) }}</span></div>
        <div class="mini-card"><span class="stat-label">Still to pay</span><span class="stat-value">{{ money(summary.totalPending) }}</span></div>
      </div>

      <div class="steps">
        <div class="step" [class.done]="summary.count > 0 && summary.notYetOnPayroll === 0">
          <strong>1. Prepare</strong>
          <span>{{ summary.notYetOnPayroll > 0 ? summary.notYetOnPayroll + ' employee(s) not on this month yet' : (summary.count ? 'Everyone with a salary is on the list' : 'Nobody on the list yet') }}</span>
          @if (canCreate) { <button class="btn btn-sm btn-primary" [disabled]="busy || summary.notYetOnPayroll === 0" (click)="generate()">Prepare payroll</button> }
        </div>
        <div class="step" [class.done]="summary.count > 0 && summary.draft === 0">
          <strong>2. Approve</strong><span>{{ summary.draft }} draft item(s)</span>
          @if (canUpdate) { <button class="btn btn-sm btn-primary" [disabled]="busy || summary.draft === 0" (click)="confirm = 'approve'">Approve all</button> }
        </div>
        <div class="step">
          <strong>3. Payslips</strong><span>for approved and paid items</span>
          @if (canPayslip) { <button class="btn btn-sm btn-ghost" [disabled]="busy || summary.approved + summary.paid === 0" (click)="payslips()">Create payslips</button> }
        </div>
        <div class="step" [class.done]="summary.count > 0 && summary.approved === 0 && summary.draft === 0">
          <strong>4. Pay</strong><span>{{ summary.approved }} approved, waiting</span>
          @if (canUpdate) { <button class="btn btn-sm btn-primary" [disabled]="busy || summary.approved === 0" (click)="confirm = 'pay'">Mark all paid</button> }
        </div>
      </div>
      @if (summary.withoutSalary > 0) {
        <div class="notice">{{ summary.withoutSalary }} active employee(s) have no basic salary, so they are skipped. <a routerLink="/staff">Set their salary in Employees</a>.</div>
      }
    }

    <div class="card">
      <div class="table-responsive pr-table">
        <table class="table">
          <thead><tr><th>Employee</th><th style="text-align:right">Basic</th><th style="text-align:right">Allowances</th><th style="text-align:right">Deductions</th><th style="text-align:right">Net pay</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>
            @for (p of rows; track p.id) {
              <tr>
                <td class="c-head" data-label="Employee">{{ p.payeeName || ('#' + (p.staffId || p.teacherId)) }}<div class="form-hint" style="margin:0">{{ p.staffNo }}{{ p.designation ? ' · ' + p.designation : '' }}</div></td>
                <td style="text-align:right" data-label="Basic">{{ money(p.basicSalary) }}</td>
                <td style="text-align:right" data-label="Allowances">{{ money(p.allowances) }}</td>
                <td style="text-align:right" data-label="Deductions">{{ money(p.deductions) }}</td>
                <td style="text-align:right" data-label="Net pay"><strong>{{ money(p.netPay) }}</strong></td>
                <td data-label="Status"><span class="badge badge-{{ badge(p.status) }}">{{ p.status }}</span>{{ p.paidOn ? ' ' + (p.paidOn | date: 'MMM d') : '' }}</td>
                <td class="c-actions" style="text-align:right">
                  @if (p.status === 'draft' && canUpdate) { <button class="btn btn-sm btn-ghost" (click)="openEdit(p)"><app-icon name="edit" [size]="14" /> Amounts</button> }
                  @if (p.status === 'approved' && canUpdate) { <button class="btn btn-sm btn-ghost" (click)="reopen(p)">Re-open</button> }
                  @if (p.status !== 'draft') { <button class="btn btn-sm btn-ghost" (click)="printSlip(p)"><app-icon name="file-text" [size]="14" /> Slip</button> }
                  @if (p.status === 'draft' && canDelete) { <button class="btn btn-sm btn-ghost" (click)="confirmDelete = p" aria-label="Remove"><app-icon name="trash" [size]="14" /></button> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty-cell">{{ loading ? 'Loading…' : 'Nothing for this month yet. Click “Prepare payroll” to create the list from your employees’ salaries.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (total > limit) {
        <div class="pagination-bar">
          <span>{{ total }} item(s) — page {{ page }} of {{ totalPages }}</span>
          <div>
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="page = page - 1; load()"><app-icon name="chevron-left" [size]="14" /></button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="page = page + 1; load()"><app-icon name="chevron-right" [size]="14" /></button>
          </div>
        </div>
      }
    </div>

    @if (editing) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">{{ editing.payeeName }} — {{ month }}</div>
            <button type="button" class="modal-close" (click)="editing = null" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="form-grid">
            <div class="form-group"><label>Basic salary</label><input type="number" min="0" class="form-control" [(ngModel)]="edit.basicSalary" name="b" /></div>
            <div class="form-group"><label>Allowances</label><input type="number" min="0" class="form-control" [(ngModel)]="edit.allowances" name="a" /></div>
            <div class="form-group"><label>Deductions</label><input type="number" min="0" class="form-control" [(ngModel)]="edit.deductions" name="d" /></div>
            <div class="form-group"><label>Net pay</label><input class="form-control" [value]="money(netOf())" disabled /></div>
          </div>
          @if (editError) { <div class="field-error">{{ editError }}</div> }
          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="editing = null">Cancel</button>
            <button class="btn btn-primary" [disabled]="busy" (click)="saveEdit()">{{ busy ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
      </div>
    }

    @if (confirm === 'approve') {
      <app-confirm-dialog title="Approve this month?" [message]="'Approve all ' + (summary?.draft ?? 0) + ' draft item(s) for ' + month + '? Amounts can no longer be changed unless you re-open an item.'" confirmLabel="Approve all" (confirm)="bulk('draft', 'approved')" (close)="confirm = ''" />
    }
    @if (confirm === 'pay') {
      <app-confirm-dialog title="Mark everything as paid?" [message]="'This records ' + (summary?.approved ?? 0) + ' salary payment(s) of ' + month + ' as paid today. Paid salaries are locked.'" confirmLabel="Mark paid" (confirm)="bulk('approved', 'paid')" (close)="confirm = ''" />
    }
    @if (confirmDelete) {
      <app-confirm-dialog title="Remove from payroll?" [message]="'Remove ' + confirmDelete.payeeName + ' from ' + month + '?'" confirmLabel="Remove" [danger]="true" (confirm)="doDelete()" (close)="confirmDelete = null" />
    }
  `,
  styles: [`
    .summary-row { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
    .step { display: flex; flex-direction: column; gap: .4rem; padding: .75rem; border: 1px solid rgba(127,127,127,.3); border-radius: 10px; align-items: flex-start; }
    .step.done { border-color: rgba(22,163,74,.6); background: rgba(22,163,74,.07); }
    .step span { font-size: .85rem; opacity: .75; }
    .pr-table td.c-actions { display: table-cell; }
    .pr-table td.c-actions .btn { margin: 0 0 .25rem .25rem; }
    @media (max-width: 1280px) {
      .pr-table { overflow-x: visible; }
      .pr-table table, .pr-table tbody, .pr-table tr, .pr-table td { display: block; width: 100%; }
      .pr-table thead { display: none; }
      .pr-table tr { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: .65rem .85rem; margin: 0 0 .75rem; }
      .pr-table tbody td { border: 0; padding: .3rem 0; display: flex; justify-content: space-between; gap: 1rem; text-align: right !important; }
      .pr-table td::before { content: attr(data-label); font-weight: 600; opacity: .6; text-align: left; }
      .pr-table td.c-head { font-weight: 700; border-bottom: 1px solid var(--border); padding-bottom: .5rem; margin-bottom: .25rem; text-align: left !important; }
      .pr-table td.c-head::before, .pr-table td.c-actions::before { content: none; }
      .pr-table td.c-actions { display: flex; flex-wrap: wrap; justify-content: flex-start; padding-top: .6rem; }
      .pr-table td.c-actions .btn { flex: 1 1 auto; justify-content: center; margin: 0; }
      .pr-table tr:has(td[colspan]) { border: 0; }
      .pr-table td[colspan]::before { content: none; }
    }
    .notice { padding: .6rem .8rem; margin-bottom: 1rem; border-radius: 8px; background: rgba(245,158,11,.15); border: 1px solid rgba(245,158,11,.5); }
  `],
})
export class PayrollComponent implements OnInit {
  month = new Date().toISOString().slice(0, 7);
  readonly maxMonth = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  rows: any[] = [];
  total = 0;
  page = 1;
  readonly limit = 20;
  loading = false;
  busy = false;
  summary: Summary | null = null;
  editing: any = null;
  edit = { basicSalary: 0, allowances: 0, deductions: 0 };
  editError = '';
  confirm: '' | 'approve' | 'pay' = '';
  confirmDelete: any = null;

  constructor(private readonly api: ApiService, private readonly toasts: ToastService, private readonly perms: PermissionService) {}

  get canCreate(): boolean { return this.perms.hasPermission('payroll:create'); }
  get canUpdate(): boolean { return this.perms.hasPermission('payroll:update'); }
  get canDelete(): boolean { return this.perms.hasPermission('payroll:delete'); }
  get canPayslip(): boolean { return this.perms.hasPermission('payslips:create'); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  money(v: unknown): string { return formatMoney(v); }
  badge(s: string): string { return ({ draft: '', approved: 'info', paid: 'success' } as Record<string, string>)[s] ?? ''; }
  netOf(): number { return Number(this.edit.basicSalary || 0) + Number(this.edit.allowances || 0) - Number(this.edit.deductions || 0); }

  ngOnInit(): void { this.reload(); }
  reload(): void { if (!this.month) return; this.page = 1; this.load(); this.loadSummary(); }

  load(): void {
    this.loading = true;
    this.api.get<any[]>('/payroll', { page: this.page, limit: this.limit, 'filter[month]': this.month }).subscribe({
      next: (r) => { this.rows = r?.data ?? []; this.total = r?.meta?.total ?? this.rows.length; this.loading = false; },
      error: () => (this.loading = false),
    });
  }
  loadSummary(): void {
    this.api.get<Summary>('/payroll/summary', { month: this.month }).subscribe({ next: (r) => (this.summary = r?.data ?? null), error: () => {} });
  }
  private refresh(): void { this.load(); this.loadSummary(); }

  private run(label: string, req: any, ok: (r: any) => string): void {
    this.busy = true;
    req.subscribe({
      next: (r: any) => { this.busy = false; this.toasts.success(ok(r)); this.refresh(); },
      error: (err: any) => { this.busy = false; this.toasts.error(err?.error?.message || `${label} failed`); },
    });
  }

  generate(): void {
    this.run('Prepare', this.api.post<any>('/payroll/generate', { month: this.month }), (r) => r?.message ?? 'Payroll prepared');
  }
  bulk(from: string, to: string): void {
    this.confirm = '';
    this.run('Update', this.api.post<any>('/payroll/bulk-status', { month: this.month, from, to }), (r) => r?.message ?? 'Updated');
  }
  payslips(): void {
    this.run('Payslips', this.api.post<any>('/payroll/payslips', { month: this.month }), (r) => r?.message ?? 'Payslips created');
  }

  openEdit(p: any): void {
    this.editing = p;
    this.edit = { basicSalary: Number(p.basicSalary), allowances: Number(p.allowances), deductions: Number(p.deductions) };
    this.editError = '';
  }
  saveEdit(): void {
    if (this.netOf() < 0) { this.editError = 'Deductions cannot be more than salary plus allowances.'; return; }
    this.busy = true;
    this.api.put(`/payroll/${this.editing.id}`, { basicSalary: Number(this.edit.basicSalary || 0), allowances: Number(this.edit.allowances || 0), deductions: Number(this.edit.deductions || 0) }).subscribe({
      next: () => { this.busy = false; this.editing = null; this.toasts.success('Amounts saved'); this.refresh(); },
      error: (err) => { this.busy = false; this.editError = err?.error?.message || 'Could not save'; },
    });
  }
  reopen(p: any): void {
    this.api.put(`/payroll/${p.id}`, { status: 'draft' }).subscribe({ next: () => { this.toasts.success('Re-opened as draft'); this.refresh(); }, error: () => {} });
  }
  doDelete(): void {
    const p = this.confirmDelete; this.confirmDelete = null;
    if (!p) return;
    this.api.delete(`/payroll/${p.id}`).subscribe({ next: () => { this.toasts.success('Removed'); this.refresh(); }, error: () => {} });
  }

  printSlip(p: any): void {
    printPayslip(this.api, {
      month: p.month, name: p.payeeName, staffNo: p.staffNo, designation: p.designation,
      basicSalary: p.basicSalary, allowances: p.allowances, deductions: p.deductions, netPay: p.netPay, status: p.status, paidOn: p.paidOn,
    }, () => this.toasts.error('Allow pop-ups to print.'));
  }
}
