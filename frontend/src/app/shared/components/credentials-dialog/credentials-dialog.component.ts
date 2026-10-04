import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { ToastService } from '../../../core/services/toast.service';

export interface LoginCredential { role: string; name: string; username: string; password: string }

/** One-time display of newly issued logins, with copy and print. The server never shows them again. */
@Component({
  selector: 'app-credentials-dialog',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="modal-backdrop">
      <div class="modal modal-lg">
        <div class="modal-head">
          <div class="modal-title">{{ title }}</div>
          <button type="button" class="modal-close" (click)="close.emit()" aria-label="Close"><app-icon name="x" [size]="16" /></button>
        </div>
        <div class="cred-warn">
          <strong>Save these now.</strong> Passwords are shown only this once. Give them to the family and ask them to change the password after the first login.
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Account</th><th>Name</th><th>Username</th><th>Password</th><th></th></tr></thead>
            <tbody>
              @for (c of credentials; track c.username) {
                <tr>
                  <td><span class="badge badge-{{ c.role === 'student' ? 'info' : 'success' }}">{{ c.role === 'parent' ? 'Parent' : 'Student' }}</span></td>
                  <td>{{ c.name }}</td>
                  <td><code>{{ c.username }}</code></td>
                  <td><code>{{ c.password }}</code></td>
                  <td><button type="button" class="btn btn-sm btn-ghost" (click)="copy(c)">Copy</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" (click)="copyAll()">Copy all</button>
          <button type="button" class="btn btn-ghost" (click)="print()">Print</button>
          <button type="button" class="btn btn-primary" (click)="close.emit()">Done, I saved them</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cred-warn { padding: .6rem .8rem; margin-bottom: .75rem; border-radius: 8px; background: rgba(245, 158, 11, .15); border: 1px solid rgba(245, 158, 11, .5); }
    code { font-size: .95em; user-select: all; }
  `],
})
export class CredentialsDialogComponent {
  @Input() title = 'Login details';
  @Input() credentials: LoginCredential[] = [];
  @Output() close = new EventEmitter<void>();

  constructor(private readonly toasts: ToastService) {}

  private line(c: LoginCredential): string {
    return `${c.role === 'parent' ? 'Parent' : 'Student'} — ${c.name}\nUsername: ${c.username}\nPassword: ${c.password}`;
  }

  private async toClipboard(text: string, ok: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toasts.success(ok);
    } catch {
      this.toasts.error('Could not copy. Select the text and copy it manually.');
    }
  }

  copy(c: LoginCredential): void { void this.toClipboard(`Username: ${c.username}\nPassword: ${c.password}`, 'Copied'); }
  copyAll(): void { void this.toClipboard(this.credentials.map((c) => this.line(c)).join('\n\n'), 'All login details copied'); }

  print(): void {
    const w = window.open('', '_blank', 'width=700,height=600');
    if (!w) { this.toasts.error('Allow pop-ups to print.'); return; }
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[ch]);
    w.document.write(`<html><head><title>Login details</title><style>body{font-family:sans-serif;padding:24px}.card{border:1px solid #999;border-radius:8px;padding:12px 16px;margin:0 0 12px;page-break-inside:avoid}code{font-size:1.1em}</style></head><body><h2>${esc(this.title)}</h2>${
      this.credentials.map((c) => `<div class="card"><strong>${c.role === 'parent' ? 'Parent' : 'Student'}: ${esc(c.name)}</strong><br>Username: <code>${esc(c.username)}</code><br>Password: <code>${esc(c.password)}</code></div>`).join('')
    }<p>Please change your password after your first login.</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }
}
