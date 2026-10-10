import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { currencyCode, formatMoney } from '../../core/utils/currency';
import { Subject, debounceTime } from 'rxjs';
import { PermissionService } from '../../core/services/permission.service';
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
  styles: [`
    .pick-chip { display:flex; justify-content:space-between; align-items:center; gap:.5rem; padding:.5rem .75rem; border:1px solid rgba(127,127,127,.35); border-radius:8px; }
    .pick-list { border:1px solid rgba(127,127,127,.35); border-radius:8px; margin-top:.35rem; max-height:200px; overflow:auto; }
    .pick-item { display:flex; gap:.5rem; align-items:baseline; width:100%; padding:.5rem .75rem; border:0; background:transparent; text-align:left; cursor:pointer; color:inherit; }
    .pick-item:hover { background:rgba(127,127,127,.12); } .pick-item small { opacity:.7; }
    .fee-list { border:1px solid rgba(127,127,127,.3); border-radius:8px; }
    .fee-row { display:flex; gap:.6rem; align-items:center; padding:.5rem .75rem; border-bottom:1px solid rgba(127,127,127,.15); cursor:pointer; }
    .fee-row:last-child { border-bottom:0; } .fee-amt { margin-left:auto; font-variant-numeric:tabular-nums; } .fee-note { font-size:.8rem; opacity:.7; margin-left:.4rem; }
    .gen-total { display:flex; gap:1rem; flex-wrap:wrap; align-items:center; justify-content:flex-end; padding:.6rem .75rem; margin:.5rem 0; border-radius:8px; background:rgba(127,127,127,.1); }
  `],
  imports: [FormsModule, CommonModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Invoices</h1>
        <p class="page-subtitle">Billing and receipts</p>
      </div>
      <div class="page-actions">
        @if (canGenerate) {
          <button class="btn btn-ghost" (click)="openHostelBilling()"><app-icon name="home" [size]="15" /> Bill hostel fees</button>
          <button class="btn btn-primary" (click)="openGenerate()"><app-icon name="plus" [size]="15" /> Generate invoice</button>
        }
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
                  @if (canChangeStatus && nextStatuses(inv).length) {
                    <select class="form-control form-control-sm" style="display:inline-block;width:auto;margin-left:6px" (change)="transition(inv, $event)">
                      <option value="">Change…</option>
                      @for (s of nextStatuses(inv); track s) { <option [value]="s">{{ s }}</option> }
                    </select>
                  }
                </td>
                <td style="text-align:right">
                  @if (canPay && inv.status !== 'paid' && inv.status !== 'cancelled') {
                    <button class="btn btn-sm btn-primary" (click)="openPay(inv)"><app-icon name="credit-card" [size]="14" /> Pay</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty-cell">{{ loading ? 'Loading…' : 'No invoices found.' }}</td></tr>
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
          <form (ngSubmit)="generate()" #g="ngForm">
            <div class="form-group">
              <label>Student *</label>
              @if (genStudent) {
                <div class="pick-chip">
                  <span>{{ genStudent.firstName }} {{ genStudent.lastName }} <small>{{ genStudent.admissionNo }}</small></span>
                  <button type="button" class="btn btn-sm btn-ghost" (click)="clearGenStudent()">Change</button>
                </div>
              } @else {
                <input class="form-control" placeholder="Type a name or admission number…" [(ngModel)]="studentQuery" (ngModelChange)="studentInput$.next()" name="sq" autocomplete="off" />
                @if (studentResults.length) {
                  <div class="pick-list">
                    @for (st of studentResults; track st.id) {
                      <button type="button" class="pick-item" (click)="chooseGenStudent(st)">{{ st.firstName }} {{ st.lastName }} <small>{{ st.admissionNo }}</small></button>
                    }
                  </div>
                } @else if (studentQuery.trim().length >= 2 && !studentLoading) {
                  <div class="form-hint">No students found.</div>
                }
              }
            </div>

            @if (genStudent) {
              <div class="form-group">
                <label>Fees to charge</label>
                @if (!genOptions) { <div class="form-hint">Loading…</div> }
                @else {
                  <div class="fee-list">
                    @for (f of genOptions.feeTypes; track f.id) {
                      <label class="fee-row">
                        <input type="checkbox" [checked]="genForm.feeTypeIds.includes(f.id)" (change)="toggleFee(f.id)" [name]="'fee' + f.id" />
                        <span>{{ f.name }}</span><span class="fee-amt">{{ money(f.amount) }}</span>
                      </label>
                    } @empty { <div class="form-hint">No fee types are set up yet. You can still add custom items below.</div> }
                    @if (genOptions.hostel) {
                      <label class="fee-row">
                        <input type="checkbox" [(ngModel)]="genForm.includeHostelFee" name="includeHostelFee" [disabled]="!!genOptions.hostel.alreadyInvoiced" />
                        <span>{{ genOptions.hostel.label }}
                          @if (genOptions.hostel.alreadyInvoiced) { <em class="fee-note">already on invoice {{ genOptions.hostel.alreadyInvoiced }}</em> }
                          @else if (!(genOptions.hostel.monthlyFee > 0)) { <em class="fee-note">monthly fee is 0 — set it on the allocation</em> }
                        </span>
                        <span class="fee-amt">{{ money(genOptions.hostel.monthlyFee) }}</span>
                      </label>
                    }
                  </div>
                }
              </div>

              <div class="form-group">
                <label>Extra items (optional)</label>
                @for (ci of genForm.customItems; track $index) {
                  <div style="display:flex;gap:6px;margin-bottom:6px">
                    <input class="form-control" placeholder="Item name" [(ngModel)]="ci.name" name="ciName{{$index}}" />
                    <input type="number" min="0" class="form-control" placeholder="Amount" style="max-width:140px" [(ngModel)]="ci.amount" name="ciAmount{{$index}}" />
                    <button type="button" class="btn btn-sm btn-ghost-danger" (click)="removeCustomItem($index)" aria-label="Remove item"><app-icon name="x" [size]="12" /></button>
                  </div>
                }
                <button type="button" class="btn btn-sm btn-ghost" (click)="addCustomItem()"><app-icon name="plus" [size]="12" /> Add item</button>
              </div>

              <div class="form-grid">
                <div class="form-group">
                  <label>Term</label>
                  <select class="form-control" [(ngModel)]="genForm.termId" name="termId">
                    <option [ngValue]="null">No term</option>
                    @for (t of genOptions?.terms ?? []; track t.id) { <option [ngValue]="t.id">{{ t.name }}{{ t.isCurrent ? ' (current)' : '' }}</option> }
                  </select>
                </div>
                <div class="form-group"><label>Due in (days)</label><input type="number" min="0" max="365" class="form-control" [(ngModel)]="genForm.dueInDays" name="dueInDays" /></div>
                <div class="form-group"><label>Discount</label><input type="number" min="0" class="form-control" [(ngModel)]="genForm.discount" name="discount" /></div>
                <div class="form-group"><label>Tax</label><input type="number" min="0" class="form-control" [(ngModel)]="genForm.tax" name="tax" /></div>
              </div>

              <div class="gen-total">
                <span>Subtotal {{ money(genGross()) }}</span>
                <span>Discount −{{ money(genForm.discount || 0) }}</span>
                <span>Tax +{{ money(genForm.tax || 0) }}</span>
                <strong>Total {{ money(genTotal()) }}</strong>
              </div>
              @if (genError) { <div class="field-error">{{ genError }}</div> }
            }

            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" (click)="showGenerate = false"><app-icon name="x" [size]="14" /> Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy || !genStudent || genGross() <= 0">
                <app-icon name="check" [size]="14" /> {{ busy ? 'Generating…' : 'Generate invoice' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (hostelDialog) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">Bill monthly hostel fees</div>
            <button type="button" class="modal-close" (click)="hostelDialog = false" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          @if (!hostelResult) {
            <p class="page-subtitle" style="margin:0 0 1rem">Creates one invoice for every student who lived in the hostel that month, using the monthly fee on their allocation. Students already billed for that month are skipped, so it is safe to run twice.</p>
            <div class="form-grid">
              <div class="form-group"><label>Month</label><input type="month" class="form-control" [(ngModel)]="hostelMonth" name="hm" /></div>
              <div class="form-group"><label>Due in (days)</label><input type="number" min="0" max="365" class="form-control" [(ngModel)]="hostelDue" name="hd" /></div>
            </div>
            @if (genError) { <div class="field-error">{{ genError }}</div> }
            <div class="modal-actions">
              <button class="btn btn-ghost" (click)="hostelDialog = false">Cancel</button>
              <button class="btn btn-primary" [disabled]="busy || !hostelMonth" (click)="billHostel()">{{ busy ? 'Billing…' : 'Create invoices' }}</button>
            </div>
          } @else {
            <div class="gen-total" style="flex-direction:column;align-items:flex-start;gap:.35rem">
              <strong>{{ hostelResult.created }} invoice(s) created — {{ money(hostelResult.total) }}</strong>
              <span>Already billed: {{ hostelResult.skippedExisting }} · No fee set: {{ hostelResult.skippedNoFee }} · Inactive: {{ hostelResult.skippedInactive }}</span>
            </div>
            <div class="modal-actions"><button class="btn btn-primary" (click)="hostelDialog = false; hostelResult = null">Done</button></div>
          }
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
              <div style="display:flex;gap:.5rem">
                <input type="number" min="0.01" step="0.01" [max]="balanceOf(payTarget)" class="form-control" [(ngModel)]="payForm.amount" name="amount" required #amount="ngModel" />
                <button type="button" class="btn btn-sm btn-ghost" (click)="payForm.amount = balanceOf(payTarget)">Full balance</button>
              </div>
              @if (p.submitted && (amount.invalid || payForm.amount > balanceOf(payTarget))) {
                <div class="field-error">Enter an amount between 0.01 and {{ money(balanceOf(payTarget)) }}</div>
              }
            </div>
            <div class="form-group">
              <label>Method</label>
              <select class="form-control" [(ngModel)]="payForm.method" name="method">
                @for (m of METHODS; track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </div>
            <div class="form-group">
              <label>{{ payForm.method === 'cash' ? 'Reference (optional)' : 'Reference / cheque / transaction no. (required)' }}</label>
              <input class="form-control" [(ngModel)]="payForm.reference" name="reference" [required]="payForm.method !== 'cash'" />
            </div>
            <div class="form-group">
              <label>Paid on</label>
              <input type="date" class="form-control" [(ngModel)]="payForm.paidOn" name="paidOn" [max]="todayStr" />
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
  readonly todayStr = new Date().toLocaleDateString('en-CA');
  busy = false;
  loading = false;
  page = 1;
  pageSize = 25;
  total = 0;
  genForm: any = this.blankGen();
  genStudent: any = null;
  genOptions: { feeTypes: any[]; terms: any[]; hostel: any } | null = null;
  genError = '';
  studentQuery = '';
  studentResults: any[] = [];
  studentLoading = false;
  readonly studentInput$ = new Subject<void>();
  hostelDialog = false;
  hostelMonth = new Date().toISOString().slice(0, 7);
  hostelDue = 14;
  hostelResult: any = null;
  payForm: any = { amount: 0, method: 'cash', reference: '', paidOn: '', currency: 'PKR', notes: '' };
  confirmDialog: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void } | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {}

  // Buttons follow the user's real permissions (a parent can view invoices but not record payments).
  get canGenerate(): boolean { return this.perms.hasPermission('invoices:create'); }
  get canPay(): boolean { return this.perms.hasPermission('payments:create'); }
  get canChangeStatus(): boolean { return this.perms.hasPermission('invoices:update'); }

  ngOnInit(): void {
    this.studentInput$.pipe(debounceTime(300)).subscribe(() => this.findStudents());
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
  nextStatuses(inv: any): string[] {
    const transitions = INVOICE_TRANSITIONS[inv?.status ?? inv] ?? [];
    const amountPaid = Number(inv?.amountPaid ?? 0);
    const totalDue = Number(inv?.totalDue ?? 0);
    return transitions.filter((s: string) => {
      if (s === 'cancelled' && amountPaid > 0) return false;
      if (s === 'paid' && amountPaid < totalDue) return false;
      if (s === 'partial' && amountPaid <= 0) return false;
      return true;
    });
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
    return formatMoney(v);
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

  private blankGen(): any {
    return { feeTypeIds: [] as number[], includeHostelFee: false, termId: null, discount: 0, tax: 0, dueInDays: 14, customItems: [] as Array<{ name: string; amount: number }> };
  }

  openGenerate(): void {
    this.genForm = this.blankGen();
    this.genStudent = null; this.genOptions = null; this.genError = '';
    this.studentQuery = ''; this.studentResults = [];
    this.showGenerate = true;
  }

  findStudents(): void {
    const q = this.studentQuery.trim();
    if (q.length < 2) { this.studentResults = []; return; }
    this.studentLoading = true;
    this.api.get<any[]>('/students', { q, limit: 15 }).subscribe({
      next: (r) => { this.studentResults = r?.data ?? []; this.studentLoading = false; },
      error: () => (this.studentLoading = false),
    });
  }

  chooseGenStudent(st: any): void {
    this.genStudent = st; this.studentResults = []; this.genOptions = null; this.genError = '';
    this.api.get<any>('/invoices/generate-options', { studentId: st.id }).subscribe({
      next: (r) => {
        this.genOptions = r?.data ?? { feeTypes: [], terms: [], hostel: null };
        const cur = this.genOptions?.terms.find((t: any) => t.isCurrent);
        this.genForm.termId = cur ? cur.id : null;
        // A resident's hostel fee is pre-ticked when it is billable and not yet on an invoice this month.
        const h = this.genOptions?.hostel;
        this.genForm.includeHostelFee = !!(h && h.monthlyFee > 0 && !h.alreadyInvoiced);
      },
      error: () => {},
    });
  }
  clearGenStudent(): void { this.genStudent = null; this.genOptions = null; this.genForm = this.blankGen(); }

  toggleFee(id: number): void {
    const list: number[] = this.genForm.feeTypeIds;
    const i = list.indexOf(id);
    i >= 0 ? list.splice(i, 1) : list.push(id);
  }

  genGross(): number {
    const fees = (this.genOptions?.feeTypes ?? []).filter((f: any) => this.genForm.feeTypeIds.includes(f.id)).reduce((a: number, f: any) => a + Number(f.amount), 0);
    const hostel = this.genForm.includeHostelFee && this.genOptions?.hostel ? Number(this.genOptions.hostel.monthlyFee) : 0;
    const custom = (this.genForm.customItems as any[]).filter((c) => c.name && Number(c.amount) > 0).reduce((a, c) => a + Number(c.amount), 0);
    return fees + hostel + custom;
  }
  genTotal(): number { return Math.max(0, this.genGross() - Number(this.genForm.discount || 0) + Number(this.genForm.tax || 0)); }

  addCustomItem(): void { this.genForm.customItems.push({ name: '', amount: 0 }); }
  removeCustomItem(index: number): void { this.genForm.customItems.splice(index, 1); }

  generate(): void {
    if (!this.genStudent) return;
    if (Number(this.genForm.discount || 0) > this.genGross()) { this.genError = 'The discount cannot be more than the subtotal.'; return; }
    this.busy = true; this.genError = '';
    const customItems = (this.genForm.customItems as any[])
      .filter((ci) => ci.name && Number(ci.amount) > 0)
      .map((ci) => ({ name: String(ci.name), amount: Number(ci.amount) }));
    const body: any = {
      studentId: this.genStudent.id,
      feeTypeIds: this.genForm.feeTypeIds,
      includeHostelFee: !!this.genForm.includeHostelFee,
      termId: this.genForm.termId || undefined,
      discount: Number(this.genForm.discount || 0), tax: Number(this.genForm.tax || 0),
      dueInDays: Number(this.genForm.dueInDays ?? 14),
    };
    if (customItems.length) body.customItems = customItems;
    this.api.post('/invoices/generate', body).subscribe({
      next: () => { this.busy = false; this.showGenerate = false; this.toasts.success('Invoice generated'); this.load(); },
      error: (err) => { this.busy = false; this.genError = err?.error?.message || 'Could not generate invoice'; },
    });
  }

  openHostelBilling(): void { this.hostelDialog = true; this.hostelResult = null; this.genError = ''; this.hostelMonth = new Date().toISOString().slice(0, 7); }

  billHostel(): void {
    this.busy = true; this.genError = '';
    this.api.post<any>('/invoices/generate-hostel', { month: this.hostelMonth, dueInDays: Number(this.hostelDue ?? 14) }).subscribe({
      next: (r) => { this.busy = false; this.hostelResult = r?.data; if (r?.data?.created) this.load(); },
      error: (err) => { this.busy = false; this.genError = err?.error?.message || 'Could not create hostel invoices'; },
    });
  }

  openPay(inv: any): void {
    this.payTarget = inv;
    this.payForm = {
      amount: Math.max(0, Number(inv.totalDue) - Number(inv.amountPaid ?? 0)),
      method: 'cash',
      reference: '',
      paidOn: new Date().toLocaleDateString('en-CA'),
      currency: currencyCode(),
      notes: '',
    };
  }

  pay(form: NgForm): void {
    if (form.invalid || Number(this.payForm.amount) > this.balanceOf(this.payTarget)) {
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
