import { ApiService } from '../../core/services/api.service';
import { formatMoney } from '../../core/utils/currency';

export interface PayslipData {
  month: string; // YYYY-MM
  name: string;
  staffNo?: string;
  designation?: string;
  basicSalary: unknown;
  allowances: unknown;
  deductions: unknown;
  netPay: unknown;
  status: string;
  paidOn?: string | null;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function monthLabel(m: string): string {
  const d = new Date(`${m}-01T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : m;
}

/** Opens a clean A5 payslip (school header, earnings/deductions, net pay, signatures) ready to print or save as PDF. */
export function printPayslip(api: ApiService, p: PayslipData, onBlocked: () => void): void {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) { onBlocked(); return; }
  w.document.write('<p style="font-family:sans-serif;padding:24px">Preparing payslip…</p>');
  api.get<Record<string, string>>('/settings/public').subscribe({
    next: (r) => write(w, p, r?.data ?? {}),
    error: () => write(w, p, {}),
  });
}

function write(w: Window, p: PayslipData, cfg: Record<string, string>): void {
  const school = esc(cfg['schoolName'] || 'School');
  const contact = [cfg['address'], cfg['phone'], cfg['contactEmail'] || cfg['email']].filter(Boolean).map(esc).join(' · ');
  const paid = p.status === 'paid';
  const paidOn = p.paidOn ? new Date(p.paidOn).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const m = (v: unknown) => esc(formatMoney(v));
  const gross = Number(p.basicSalary || 0) + Number(p.allowances || 0);
  const info = (k: string, v: unknown) => v ? `<div><span>${k}</span><b>${esc(v)}</b></div>` : '';
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(p.month)} - ${esc(p.name)}</title>
<style>
  @page { size: A5; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
  .sheet { max-width: 560px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; position: relative; }
  .head { background: #0f766e; color: #fff; padding: 20px 24px; text-align: center; }
  .head h1 { margin: 0; font-size: 22px; letter-spacing: .5px; }
  .head p { margin: 4px 0 0; font-size: 12px; opacity: .9; }
  .title { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; border-bottom: 1px dashed #cbd5e1; }
  .title b { font-size: 15px; letter-spacing: 2px; text-transform: uppercase; }
  .title span { font-size: 13px; color: #475569; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .info div { display: flex; flex-direction: column; font-size: 14px; }
  .info span { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; background: #f1f5f9; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #475569; padding: 8px 24px; }
  th:last-child, td:last-child { text-align: right; }
  td { padding: 9px 24px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
  tr.sub td { font-weight: 600; background: #fafafa; }
  td.minus { color: #b91c1c; }
  .total { background: #f0fdfa; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-top: 2px solid #0f766e; }
  .total span { font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 1px; }
  .total b { font-size: 26px; color: #0f766e; }
  .stamp { position: absolute; right: 24px; bottom: 98px; transform: rotate(-10deg); border: 3px solid ${paid ? '#15803d' : '#b45309'}; color: ${paid ? '#15803d' : '#b45309'}; padding: 2px 14px; font-size: 20px; font-weight: 800; letter-spacing: 3px; border-radius: 6px; opacity: .75; }
  .sign { display: flex; justify-content: space-between; padding: 40px 24px 14px; gap: 24px; }
  .sign div { flex: 1; border-top: 1px solid #94a3b8; text-align: center; font-size: 12px; color: #64748b; padding-top: 6px; }
  .foot { text-align: center; font-size: 11px; color: #94a3b8; padding: 0 24px 16px; }
  .noprint { text-align: center; margin: 16px; }
  @media print { body { padding: 0; } .noprint { display: none; } .sheet { border: 1px solid #94a3b8; } }
</style></head><body>
<div class="sheet">
  <div class="head"><h1>${school}</h1>${contact ? `<p>${contact}</p>` : ''}</div>
  <div class="title"><b>Salary Slip</b><span>${esc(monthLabel(p.month))}</span></div>
  <div class="stamp">${paid ? 'PAID' : 'APPROVED'}</div>
  <div class="info">
    ${info('Employee', p.name)}${info('Employee no.', p.staffNo)}${info('Designation', p.designation)}${info(paid ? 'Paid on' : 'Status', paid ? paidOn : 'Approved, payment pending')}
  </div>
  <table>
    <tr><th>Earnings</th><th>Amount</th></tr>
    <tr><td>Basic salary</td><td>${m(p.basicSalary)}</td></tr>
    <tr><td>Allowances</td><td>${m(p.allowances)}</td></tr>
    <tr class="sub"><td>Gross salary</td><td>${m(gross)}</td></tr>
    <tr><th>Deductions</th><th></th></tr>
    <tr><td>Total deductions</td><td class="minus">− ${m(p.deductions)}</td></tr>
  </table>
  <div class="total"><span>Net pay</span><b>${m(p.netPay)}</b></div>
  <div class="sign"><div>Employee signature</div><div>Accounts / Principal</div></div>
  <div class="foot">This is a computer-generated payslip. Please keep it confidential.</div>
</div>
<div class="noprint"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer">Print / Save as PDF</button></div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`);
  w.document.close();
}
