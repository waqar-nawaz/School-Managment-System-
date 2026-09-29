import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

// Mirror of backend INVOICE_TRANSITIONS (invoices.routes.ts).
const INVOICE_TRANSITIONS: Record<string, string[]> = {
  pending: ['partial', 'overdue', 'cancelled'],
  partial: ['paid', 'overdue', 'cancelled'],
  paid: ['cancelled'],
  overdue: ['paid', 'partial', 'cancelled'],
  cancelled: [],
};

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [FormsModule, CommonModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Invoices</h1>
        <p class="page-subtitle">Billing and receipts</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openGenerate()"><app-icon name="plus" [size]="15" /> Generate invoice</button>
      </div>
    </div>

    <div class="card">
      <div class="card-toolbar">
        <div class="search-box">
          <input class="form-control" placeholder="Search invoice no…" [(ngModel)]="search" (ngModelChange)="debouncedLoad()" />
          @if (search) {
            <button type="button" class="search-clear" (click)="clearSearch()" aria-label="Clear search">
              <app-icon name="x" [size]="14" />
            </button>
          }
        </div>
        <select class="form-control" style="max-width:160px" [(ngModel)]="statusFilter" (ngModelChange)="onFilterChange()">
          <option value="">All statuses</option>
          @for (s of ['pending','partial','paid','overdue','cancelled']; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>No</th><th>Student</th><th>Amount</th><th>Discount</th><th>Due</th><th>Paid</th><th>Due Date</th><th>Status</th><th style="width:90px;text-align:right">Actions</th></tr>
          </thead>
          <tbody>
            @for (inv of invoices; track inv.id) {
              <tr>
                <td>{{ inv.invoiceNo }}</td>
                <td>{{ studentNameOf(inv) }}</td>
                <td>{{ money(inv.amount) }}</td>
                <td>{{ money(inv.discount ?? 0) }}</td>
                <td>{{ money(inv.totalDue) }}</td>
                <td>{{ money(inv.amountPaid ?? 0) }}</td>
                <td>{{ inv.dueDate | date: 'MMM d, y' }}</td>
                <td>
                  <span class="badge badge-{{ badgeOf(inv.status) }}">{{ inv.status }}</span>
                  @if (nextStatuses(inv.status).length) {
                    <select class="form-control form-control-sm" style="display:inline-block;width:auto;margin-left:6px" (change)="transition(inv, $event)">
                      <option value="">Change…</option>
                      @for (s of nextStatuses(inv.status); track s) { <option [value]="s">{{ s }}</option> }
                    </select>
                  }
                </td>
                <td style="text-align:right">
                  @if (inv.status !== 'paid' && inv.status !== 'cancelled') {
                    <button class="btn btn-sm btn-primary" (click)="openPay(inv)"><app-icon name="credit-card" [size]="14" /> Pay</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty-cell">{{ loading ? 'Loading…' : 'No invoices.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (invoices.length || total > 0) {
        <div class="pagination-bar">
          <span>{{ total }} invoice(s) — page {{ page }} of {{ totalPages }}</span>
          <div>
            <button class="btn btn-sm btn-ghost" [disabled]="page <= 1" (click)="setPage(page - 1)"><app-icon name="chevron-left" [size]="14" /></button>
            <button class="btn btn-sm btn-ghost" [disabled]="page >= totalPages" (click)="setPage(page + 1)"><app-icon name="chevron-right" [size]="14" /></button>
          </div>
        </div>
      }
    </div>

    @if (showGenerate) {
      <div class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div class="modal-title">Generate invoice</div>
            <button type="button" class="modal-close" (click)="showGenerate = false" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <form (ngSubmit)="generate(g)" #g="ngForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Student ID *</label>
                <input type="number" class="form-control" [(ngModel)]="genForm.studentId" name="studentId" required #studentId="ngModel" />
                @if (g.submitted && studentId.invalid) {
                  <div class="field-error">Student ID is required</div>
                }
              </div>
              <div class="form-group"><label>Term ID</label><input type="number" class="form-control" [(ngModel)]="genForm.termId" name="termId" /></div>
              <div class="form-group"><label>Academic year ID</label><input type="number" class="form-control" [(ngModel)]="genForm.academicYearId" name="academicYearId" /></div>
              <div class="form-group"><label>Discount</label><input type="number" min="0" class="form-control" [(ngModel)]="genForm.discount" name="discount" /></div>
              <div class="form-group"><label>Tax</label><input type="number" min="0" class="form-control" [(ngModel)]="genForm.tax" name="tax" /></div>
              <div class="form-group"><label>Due in (days)</label><input type="number" min="0" max="365" class="form-control" [(ngModel)]="genForm.dueInDays" name="dueInDays" /></div>
            </div>
            <div class="form-group">
              <label>Fee types (IDs, comma separated)</label>
              <input class="form-control" placeholder="e.g. 1,2,3" [(ngModel)]="genForm.feeTypeIdsRaw" name="feeTypeIdsRaw" />
            </div>
            <div class="form-group">
              <label>Custom line items</label>
              @for (ci of genForm.customItems; track $index) {
                <div style="display:flex;gap:6px;margin-bottom:6px">
                  <input class="form-control" placeholder="Item name" [(ngModel)]="ci.name" name="ciName{{$index}}" />
                  <input type="number" min="0" class="form-control" placeholder="Amount" style="max-width:140px" [(ngModel)]="ci.amount" name="ciAmount{{$index}}" />
                  <button type="button" class="btn btn-sm btn-ghost-danger" (click)="removeCustomItem($index)"><app-icon name="x" [size]="12" /></button>
                </div>
              }
              <button type="button" class="btn btn-sm btn-ghost" (click)="addCustomItem()"><app-icon name="plus" [size]="12" /> Add item</button>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showGenerate = false"><app-icon name="x" [size]="14" /> Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy">
                <app-icon name="check" [size]="14" /> {{ busy ? 'Generating…' : 'Generate' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (payTarget) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">Record payment</div>
            <button type="button" class="modal-close" (click)="payTarget = null" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <form (ngSubmit)="pay(p)" #p="ngForm">
            <div class="form-group">
              <label>Amount (balance {{ money(balanceOf(payTarget)) }})</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="payForm.amount" name="amount" required #amount="ngModel" />
              @if (p.submitted && amount.invalid) {
                <div class="field-error">Amount is required</div>
              }
            </div>
            <div class="form-group">
              <label>Method</label>
              <select class="form-control" [(ngModel)]="payForm.method" name="method">
                @for (m of METHODS; track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </div>
            <div class="form-group"><label>Reference</label><input class="form-control" [(ngModel)]="payForm.reference" name="reference" /></div>
            <div class="form-group">
              <label>Paid on</label>
              <input type="date" class="form-control" [(ngModel)]="payForm.paidOn" name="paidOn" />
            </div>
            <div class="form-group">
              <label>Currency</label>
              <select class="form-control" [(ngModel)]="payForm.currency" name="currency">
                @for (c of CURRENCIES; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </div>
            <div class="form-group"><label>Notes</label><textarea class="form-control" [(ngModel)]="payForm.notes" name="notes" rows="2"></textarea></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="payTarget = null"><app-icon name="x" [size]="14" /> Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy">
                <app-icon name="check" [size]="14" /> {{ busy ? 'Recording…' : 'Record payment' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (confirmDialog) {
      <app-confirm-dialog
        [title]="confirmDialog.title"
        [message]="confirmDialog.message"
        [confirmLabel]="confirmDialog.confirmLabel || 'Confirm'"
        [danger]="confirmDialog.danger || false"
        (confirm)="confirmDialog.onConfirm()"
        (close)="confirmDialog = null"
      />
    }
  `,
})
export class InvoicesComponent implements OnInit {
  // Align with backend invoices.routes.ts ALLOWED_METHODS (cash|card|bank|mobile|online|bank_transfer|cheque).
  readonly METHODS = ['cash', 'card', 'bank', 'mobile', 'online', 'bank_transfer', 'cheque'];
  readonly CURRENCIES = ['PKR', 'USD', 'GBP', 'EUR', 'AED'];
  invoices: any[] = [];
  search = '';
  statusFilter = '';
  showGenerate = false;
  payTarget: any = null;
  busy = false;
  loading = false;
  page = 1;
  pageSize = 25;
  total = 0;
  genForm: any = { discount: 0, tax: 0, dueInDays: 14, feeTypeIdsRaw: '', customItems: [] };
  payForm: any = { amount: 0, method: 'cash', reference: '', paidOn: '', currency: 'PKR', notes: '' };
  confirmDialog: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void } | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.pageSize, q: this.search };
    if (this.statusFilter) params['filter[status]'] = this.statusFilter;
    this.api.get<any[]>('/invoices', params).subscribe({
      next: (res) => {
        this.invoices = res?.data ?? [];
        this.total = res?.meta?.total ?? this.invoices.length;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  debouncedLoad(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.page = 1;
      this.load();
    }, 300);
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }

  setPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.load();
  }

  // Compute the list of statuses the user may transition to from the current status.
  nextStatuses(current: string): string[] {
    return INVOICE_TRANSITIONS[current] ?? [];
  }

  // Backend eagerly loads the `student` association (invoices.routes.ts:20).
  studentNameOf(inv: any): string {
    const s = inv?.student;
    if (!s) return `#${inv?.studentId ?? ''}`;
    const first = s.firstName ?? '';
    const last = s.lastName ?? '';
    const name = `${first} ${last}`.trim();
    return name || s.admissionNo || `#${inv?.studentId ?? ''}`;
  }

  money(v: unknown): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(Number(v ?? 0));
  }

  balanceOf(inv: any): number {
    return Math.max(0, Number(inv.totalDue) - Number(inv.amountPaid ?? 0));
  }

  badgeOf(s: string): string {
    return ({ paid: 'success', partial: 'warning', pending: 'info', overdue: 'danger', cancelled: '' } as Record<string, string>)[s] ?? '';
  }

  clearSearch(): void {
    this.search = '';
    this.page = 1;
    this.load();
  }

  openGenerate(): void {
    this.genForm = { discount: 0, tax: 0, dueInDays: 14, feeTypeIdsRaw: '', customItems: [] };
    this.showGenerate = true;
  }

  addCustomItem(): void {
    this.genForm.customItems.push({ name: '', amount: 0 });
  }

  removeCustomItem(index: number): void {
    this.genForm.customItems.splice(index, 1);
  }

  generate(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy = true;
    const feeTypeIds = (this.genForm.feeTypeIdsRaw || '').split(',').map((s: string) => Number(s.trim())).filter(Number.isFinite);
    const customItems = (this.genForm.customItems || [])
      .filter((ci: any) => ci.name && Number(ci.amount) > 0)
      .map((ci: any) => ({ name: String(ci.name), amount: Number(ci.amount) }));
    const body = { ...this.genForm, feeTypeIds, customItems };
    delete body.feeTypeIdsRaw;
    delete body.customItems;
    if (customItems.length) body.customItems = customItems;
    this.api.post('/invoices/generate', body).subscribe({
      next: () => {
        this.busy = false;
        this.showGenerate = false;
        this.toasts.success('Invoice generated');
        this.load();
      },
      error: (err) => {
        this.busy = false;
        this.toasts.error(err?.error?.message || 'Could not generate invoice');
      },
    });
  }

  openPay(inv: any): void {
    this.payTarget = inv;
    this.payForm = {
      amount: Math.max(0, Number(inv.totalDue) - Number(inv.amountPaid ?? 0)),
      method: 'cash',
      reference: '',
      paidOn: new Date().toLocaleDateString('en-CA'),
      currency: 'PKR',
      notes: '',
    };
  }

  pay(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy = true;
    this.api.post(`/invoices/${this.payTarget.id}/pay`, this.payForm).subscribe({
      next: () => {
        this.busy = false;
        this.payTarget = null;
        this.toasts.success('Payment recorded, receipt issued');
        this.load();
      },
      error: (err) => {
        this.busy = false;
        this.toasts.error(err?.error?.message || 'Could not record payment');
      },
    });
  }

  transition(inv: any, event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    (event.target as HTMLSelectElement).value = '';
    if (!next || next === inv.status) return;
    // Confirm before terminal/irreversible transitions (cancelled).
    if (next === 'cancelled') {
      this.confirmDialog = {
        title: 'Cancel invoice',
        message: `Cancel invoice ${inv.invoiceNo}? This is irreversible — the invoice cannot be reopened.`,
        confirmLabel: 'Cancel invoice',
        danger: true,
        onConfirm: () => {
          this.confirmDialog = null;
          this.doTransition(inv, next);
        },
      };
      return;
    }
    this.doTransition(inv, next);
  }

  private doTransition(inv: any, next: string): void {
    this.api.patch(`/invoices/${inv.id}/status`, { status: next }).subscribe({
      next: () => {
        inv.status = next;
        this.toasts.success(`Invoice moved to ${next}`);
        this.load();
      },
      error: (err) => {
        this.toasts.error(err?.error?.message || `Could not transition to ${next}`);
      },
    });
  }
}
