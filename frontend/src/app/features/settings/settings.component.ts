import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Key–value configuration</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="showAddForm = true"><app-icon name="plus" [size]="15" /> Add setting</button>
      </div>
    </div>

    <div class="card">
      <div class="card-toolbar">
        <select class="form-control" style="max-width:200px" [(ngModel)]="scope" (ngModelChange)="load()">
          <option value="system">system</option>
          <option value="general">general</option>
          <option value="academics">academics</option>
          <option value="finance">finance</option>
          <option value="transport">transport</option>
          <option value="library">library</option>
          <option value="hostel">hostel</option>
          <option value="communication">communication</option>
          <option value="services">services</option>
          <option value="administration">administration</option>
        </select>
        <button class="btn btn-ghost" (click)="saveAll()" [disabled]="saving">
          <app-icon name="check" [size]="15" /> {{ saving ? 'Saving…' : 'Save all' }}
        </button>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th style="width:260px">Key</th><th>Value</th><th style="width:200px">Description</th><th style="width:80px">Public</th><th style="width:60px"></th></tr></thead>
          <tbody>
            @for (row of rows; track row.key) {
              <tr>
                <td><code>{{ row.key }}</code></td>
                <td><input class="form-control" [(ngModel)]="row.value" /></td>
                <td><input class="form-control" [(ngModel)]="row.description" /></td>
                <td><input type="checkbox" class="form-checkbox" [(ngModel)]="row.isPublic" /></td>
                <td><button class="btn btn-sm btn-ghost-danger" (click)="remove(row)"><app-icon name="trash" [size]="14" /></button></td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty-cell">No settings in this scope.</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (rows.length) {
        <div class="pagination-bar">
          <span>{{ rows.length }} setting(s)</span>
          <button class="btn btn-primary btn-sm" (click)="saveAll()" [disabled]="saving">
            <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save all' }}
          </button>
        </div>
      }
    </div>

    @if (showAddForm) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">Add setting</div>
            <button type="button" class="modal-close" (click)="showAddForm = false" aria-label="Close">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
          <div class="form-group">
            <label>Key *</label>
            <input class="form-control" [(ngModel)]="newKey" placeholder="e.g. school_name" autofocus />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="showAddForm = false">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="confirmAdd()" [disabled]="!newKey.trim()">Add</button>
          </div>
        </div>
      </div>
    }

    @if (confirmTarget) {
      <app-confirm-dialog
        title="Delete setting"
        message="Are you sure you want to delete this setting?"
        (confirm)="confirmRemove()"
        (close)="confirmTarget = null"
      />
    }
  `,
})
export class SettingsComponent implements OnInit {
  scope = 'system';
  rows: Array<{ key: string; value: string; isPublic: boolean; description: string }> = [];
  saving = false;
  showAddForm = false;
  newKey = '';
  confirmTarget: { key: string } | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<Record<string, unknown>>('/settings', { scope: this.scope }).subscribe({
      next: (res) => {
        const map = res?.data ?? {};
        this.rows = Object.entries(map).map(([key, raw]) => {
          if (raw && typeof raw === 'object') {
            const v = raw as { value?: unknown; isPublic?: unknown; description?: unknown };
            return {
              key,
              value: v.value != null ? String(v.value) : '',
              isPublic: Boolean(v.isPublic),
              description: v.description != null ? String(v.description) : '',
            };
          }
          return { key, value: raw != null ? String(raw) : '', isPublic: false, description: '' };
        });
      },
      error: () => {},
    });
  }

  addSetting(): void {
    // Replaced by modal: caller sets showAddForm = true and then confirms via confirmAdd().
    this.showAddForm = true;
    this.newKey = '';
  }

  confirmAdd(): void {
    const key = (this.newKey || '').trim();
    if (!key) return;
    if (this.rows.some((r) => r.key === key)) {
      this.toasts.error('Key already exists in this scope');
      return;
    }
    this.rows.push({ key, value: '', isPublic: false, description: '' });
    this.showAddForm = false;
    this.newKey = '';
  }

  remove(row: { key: string }): void {
    // Confirm before delete — previously this was an immediate destructive call.
    this.confirmTarget = row;
  }

  confirmRemove(): void {
    const row = this.confirmTarget;
    this.confirmTarget = null;
    if (!row) return;
    this.api.delete('/settings', { scope: this.scope, key: row.key }).subscribe({
      next: () => {
        this.rows = this.rows.filter((r) => r.key !== row.key);
        this.toasts.success('Setting removed');
      },
      error: () => {},
    });
  }

  saveAll(): void {
    const payload = this.rows.map((r) => ({ scope: this.scope, key: r.key, value: r.value, isPublic: r.isPublic, description: r.description }));
    if (!payload.length) return;
    this.saving = true;
    this.api.post('/settings/bulk', payload).subscribe({
      next: () => {
        this.saving = false;
        this.toasts.success('Settings saved');
        this.load();
      },
      error: () => {
        this.saving = false;
      },
    });
  }
}