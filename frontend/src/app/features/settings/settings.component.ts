import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Key–value configuration</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="addSetting()"><app-icon name="plus" [size]="15" /> Add setting</button>
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
        </select>
        <button class="btn btn-ghost" (click)="saveAll()"><app-icon name="check" [size]="15" /> Save all</button>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th style="width:300px">Key</th><th>Value</th><th style="width:90px">Public</th><th style="width:70px"></th></tr></thead>
          <tbody>
            @for (row of rows; track row.key) {
              <tr>
                <td><code>{{ row.key }}</code></td>
                <td><input class="form-control" [(ngModel)]="row.value" /></td>
                <td><input type="checkbox" class="form-checkbox" [(ngModel)]="row.isPublic" /></td>
                <td><button class="btn btn-sm btn-ghost-danger" (click)="remove(row)"><app-icon name="trash" [size]="14" /></button></td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="empty-cell">No settings in this scope.</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (rows.length) {
        <div class="pagination-bar">
          <span>{{ rows.length }} setting(s)</span>
          <button class="btn btn-primary btn-sm" (click)="saveAll()"><app-icon name="check" [size]="14" /> Save all</button>
        </div>
      }
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  scope = 'system';
  rows: Array<{ key: string; value: string; isPublic: boolean }> = [];

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<Record<string, string>>('/settings', { scope: this.scope }).subscribe({
      next: (res) => {
        const map = res?.data ?? {};
        this.rows = Object.entries(map).map(([key, value]) => ({ key, value, isPublic: false }));
      },
      error: () => {},
    });
  }

  addSetting(): void {
    const key = prompt('New setting key');
    if (!key) return;
    this.rows.push({ key: key.trim(), value: '', isPublic: false });
  }

  remove(row: { key: string }): void {
    this.api.delete('/settings', { scope: this.scope, key: row.key }).subscribe({
      next: () => {
        this.rows = this.rows.filter((r) => r.key !== row.key);
        this.toasts.success('Setting removed');
      },
      error: () => {},
    });
  }

  saveAll(): void {
    const payload = this.rows.map((r) => ({ scope: this.scope, key: r.key, value: r.value, isPublic: r.isPublic }));
    if (!payload.length) return;
    this.api.post('/settings/bulk', payload).subscribe({
      next: () => {
        this.toasts.success('Settings saved');
        this.load();
      },
      error: () => {},
    });
  }
}