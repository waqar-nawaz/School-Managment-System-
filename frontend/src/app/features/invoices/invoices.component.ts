import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [FormsModule, CommonModule, IconComponent],
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
        <input class="form-control" style="max-width:300px" placeholder="Search invoice no…" [(ngModel)]="search" (ngModelChange)="load()" />
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>No</th><th>Student</th><th>Amount</th><th>Discount</th><th>Due</th><th>Paid</th><th>Due Date</th><th>Status</th><th style="width:90px;text-align:right">Pay</th></tr>
          </thead>
          <tbody>
            @for (inv of invoices; track inv.id) {
              <tr>
                <td>{{ inv.invoiceNo }}</td>
                <td>{{ inv.studentId }}</td>
                <td>{{ money(inv.amount) }}</td>
                <td>{{ money(inv.discount ?? 0) }}</td>
                <td>{{ money(inv.totalDue) }}</td>
                <td>{{ money(inv.amountPaid ?? 0) }}</td>
                <td>{{ inv.dueDate | date: 'MMM d, y' }}</td>
                <td><span class="badge badge-{{ badgeOf(inv.status) }}">{{ inv.status }}</span></td>
                <td style="text-align:right">
                  @if (inv.status !== 'paid' && inv.status !== 'cancelled') {
                    <button class="btn btn-sm btn-primary" (click)="openPay(inv)"><app-icon name="credit-card" [size]="14" /> Pay</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty-cell">No invoices.</td></tr>
            }
          </tbody>
        </table>
      </div>
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
              <div class="form-group"><label>Discount</label><input type="number" class="form-control" [(ngModel)]="genForm.discount" name="discount" /></div>
              <div class="form-group"><label>Tax</label><input type="number" class="form-control" [(ngModel)]="genForm.tax" name="tax" /></div>
              <div class="form-group"><label>Due in (days)</label><input type="number" class="form-control" [(ngModel)]="genForm.dueInDays" name="dueInDays" /></div>
            </div>
            <div class="form-group">
              <label>Fee types (IDs, comma separated)</label>
              <input class="form-control" placeholder="e.g. 1,2,3" [(ngModel)]="genForm.feeTypeIdsRaw" name="feeTypeIdsRaw" />
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
              <input type="number" class="form-control" [(ngModel)]="payForm.amount" name="amount" required #amount="ngModel" />
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
  `,
})
export class InvoicesComponent implements OnInit {
  readonly METHODS = ['cash', 'card', 'bank_transfer', 'cheque', 'online'];
  invoices: any[] = [];
  search = '';
  showGenerate = false;
  payTarget: any = null;
  busy = false;
  genForm: any = { discount: 0, tax: 0, dueInDays: 14 };
  payForm: any = { amount: 0, method: 'cash', reference: '' };
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<any[]>('/invoices', { page: 1, limit: 100, q: this.search }).subscribe({
      next: (res) => (this.invoices = res?.data ?? []),
      error: () => {},
    });
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

  openGenerate(): void {
    this.genForm = { discount: 0, tax: 0, dueInDays: 14, feeTypeIdsRaw: '' };
    this.showGenerate = true;
  }

  generate(form: NgForm): void {
    if (form.invalid) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy = true;
    const feeTypeIds = (this.genForm.feeTypeIdsRaw || '').split(',').map((s: string) => Number(s.trim())).filter(Number.isFinite);
    const body = { ...this.genForm, feeTypeIds };
    delete body.feeTypeIdsRaw;
    this.api.post('/invoices/generate', body).subscribe({
      next: () => {
        this.busy = false;
        this.showGenerate = false;
        this.toasts.success('Invoice generated');
        this.load();
      },
      error: () => {
        this.busy = false;
      },
    });
  }

  openPay(inv: any): void {
    this.payTarget = inv;
    this.payForm = { amount: Math.max(0, Number(inv.totalDue) - Number(inv.amountPaid ?? 0)), method: 'cash', reference: '' };
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
      error: () => {
        this.busy = false;
      },
    });
  }
}