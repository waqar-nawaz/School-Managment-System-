import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface SettingsRow {
  key: string;
  value: string;
  isPublic: boolean;
  description: string;
}

interface ScopeDef {
  key: string;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Configure school-wide preferences and module options.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openAddForm()"><app-icon name="plus" [size]="15" /> Add setting</button>
      </div>
    </div>

    <div class="settings-layout">
      <aside class="settings-scopes">
        <div class="scopes-head">
          <span>Categories</span>
          @if (loading) { <span class="scopes-spinner"></span> }
        </div>
        @for (s of SCOPES; track s.key) {
          <button
            type="button"
            class="scope-item"
            [class.active]="scope === s.key"
            (click)="changeScope(s.key)"
            [title]="s.description">
            <span class="scope-icon"><app-icon [name]="s.icon" [size]="16" /></span>
            <span class="scope-copy">
              <strong>{{ s.label }}</strong>
              <small>{{ countInScope(s.key) }} settings</small>
            </span>
          </button>
        }
      </aside>

      <main class="card settings-editor">
        <header class="settings-head">
          <div>
            <h2 class="settings-title">{{ currentScope?.label || pretty(scope) }}</h2>
            <p class="settings-subtitle">{{ currentScope?.description || ('All keys under the ' + scope + ' scope.') }}</p>
          </div>
          <div class="settings-search">
            <app-icon name="search" [size]="14" class="search-leading" />
            <input class="form-control" placeholder="Filter keys…" [(ngModel)]="filter" />
          </div>
        </header>

        @if (loading) {
          <div class="settings-skel-list">
            @for (i of [1,2,3,4,5]; track i) {
              <div class="setting-row-skel">
                <div class="line-skel line-skel-key"></div>
                <div class="line-skel line-skel-value"></div>
              </div>
            }
          </div>
        } @else if (filteredRows.length) {
          <div class="settings-list">
            @for (row of filteredRows; track row.key) {
              <div class="setting-row">
                <div class="setting-row-head">
                  <code class="setting-key">{{ row.key }}</code>
                  <div class="setting-row-controls">
                    <label class="setting-public" [title]="row.isPublic ? 'Visible to non-admins' : 'Admin-only'">
                      <input type="checkbox" class="form-checkbox" [(ngModel)]="row.isPublic" (ngModelChange)="markDirty()" />
                      <span class="setting-public-label">Public</span>
                    </label>
                    <button type="button" class="setting-delete" (click)="remove(row)" title="Delete this setting">
                      <app-icon name="trash" [size]="14" />
                    </button>
                  </div>
                </div>
                <input class="form-control setting-value" [(ngModel)]="row.value" (ngModelChange)="markDirty()" placeholder="Empty value" />
                <input class="form-control setting-description" [(ngModel)]="row.description" (ngModelChange)="markDirty()" placeholder="Optional description (shown to admins)" />
              </div>
            }
          </div>
        } @else {
          <div class="settings-empty">
            <div class="settings-empty-icon"><app-icon name="settings" [size]="28" /></div>
            <strong>{{ filter ? 'No matches' : 'No settings in this scope' }}</strong>
            <span>{{ filter ? 'Try a different filter term.' : 'Add the first setting to this category to get started.' }}</span>
          </div>
        }

        @if (filteredRows.length) {
          <div class="settings-save-bar">
            <span class="settings-save-status">
              @if (dirty) {
                <span class="unsaved-dot"></span>
                Unsaved changes
              } @else {
                <app-icon name="check" [size]="14" />
                <span>All saved</span>
              }
            </span>
            <div class="settings-save-actions">
              <button class="btn btn-ghost" [disabled]="!dirty || saving" (click)="resetChanges()">
                <app-icon name="refresh" [size]="14" /> Undo
              </button>
              <button class="btn btn-primary" [disabled]="!dirty || saving" (click)="saveAll()">
                <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save all' }}
              </button>
            </div>
          </div>
        }
      </main>
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
          <div class="form-grid">
            <div class="form-group">
              <label>Key *</label>
              <input class="form-control" [(ngModel)]="newKey" placeholder="e.g. school_name" autofocus />
              <div class="form-hint">Lowercase letters, numbers and underscores.</div>
              @if (newKey && !validKey) { <div class="field-error">Key must match <code>^[a-z][a-z0-9_]*$</code>.</div> }
              @if (newKey && keyExists) { <div class="field-error">A setting with this key already exists in this scope.</div> }
            </div>
            <div class="form-group">
              <label>Scope</label>
              <select class="form-control" [(ngModel)]="addScope">
                @for (s of SCOPES; track s.key) { <option [value]="s.key">{{ s.label }}</option> }
              </select>
              <div class="form-hint">Choose the category this setting belongs to.</div>
            </div>
            <div class="form-group form-group-full">
              <label>Value</label>
              <input class="form-control" [(ngModel)]="newValue" placeholder="Initial value (optional)" />
            </div>
            <div class="form-group form-group-full">
              <label>Description</label>
              <input class="form-control" [(ngModel)]="newDescription" placeholder="What does this setting control?" />
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="showAddForm = false">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="!validKey || keyExists" (click)="confirmAdd()">
              <app-icon name="check" [size]="14" /> Add setting
            </button>
          </div>
        </div>
      </div>
    }

    @if (confirmTarget) {
      <app-confirm-dialog
        title="Delete setting"
        [message]="'Delete ' + confirmTarget.key + '? This cannot be undone.'"
        (confirm)="confirmRemove()"
        (close)="confirmTarget = null" />
    }
  `,
  styles: [`
    .settings-layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: start; }

    /* Scopes sidebar */
    .settings-scopes { display: flex; flex-direction: column; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 10px; position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; }
    .scopes-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
    .scopes-spinner { width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: settings-spin .7s linear infinite; }
    @keyframes settings-spin { to { transform: rotate(360deg); } }
    .scope-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; background: transparent; border-radius: 10px; cursor: pointer; text-align: left; color: inherit; transition: background .15s; }
    .scope-item:hover { background: var(--row-hover); }
    .scope-item.active { background: var(--primary-light); }
    .scope-icon { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: var(--neutral-100); color: var(--text-muted); flex-shrink: 0; }
    .scope-item.active .scope-icon { background: var(--primary); color: #fff; }
    .scope-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .scope-copy strong { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .scope-item.active .scope-copy strong { color: var(--primary); }
    .scope-copy small { font-size: 11px; color: var(--text-muted); }

    /* Editor */
    .settings-editor { padding: 0; overflow: hidden; }
    .settings-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .settings-title { margin: 0; font-size: 17px; font-weight: 700; }
    .settings-subtitle { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
    .settings-search { position: relative; flex-shrink: 0; }
    .settings-search .search-leading { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .settings-search .form-control { padding-left: 30px; min-width: 220px; }

    /* Settings list */
    .settings-list { padding: 14px 20px 80px; display: flex; flex-direction: column; gap: 10px; }
    .setting-row { border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; background: var(--surface); transition: border-color .15s; }
    .setting-row:hover { border-color: var(--primary); }
    .setting-row-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
    .setting-key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 600; color: var(--text); background: var(--neutral-100); padding: 3px 8px; border-radius: 5px; }
    body.dark-theme .setting-key { background: rgba(255,255,255,.06); }
    .setting-row-controls { display: flex; align-items: center; gap: 8px; }
    .setting-public { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--text-muted); }
    .setting-public-label { text-transform: uppercase; letter-spacing: .04em; }
    .setting-delete { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 0; background: transparent; color: var(--text-muted); border-radius: 5px; cursor: pointer; transition: all .15s; }
    .setting-delete:hover { background: rgba(192,57,43,.12); color: var(--danger); }
    body.dark-theme .setting-delete:hover { background: rgba(192,57,43,.22); color: #fca5a5; }

    .setting-value { font-family: inherit; margin-bottom: 6px; }
    .setting-description { font-size: 12px; color: var(--text-muted); border-style: dashed; }

    /* Save bar */
    .settings-save-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; background: var(--surface); border-top: 1px solid var(--border); position: sticky; bottom: 0; }
    .settings-save-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
    .unsaved-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warning); animation: settings-pulse 1.6s ease-in-out infinite; }
    @keyframes settings-pulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
    .settings-save-actions { display: flex; gap: 8px; }

    /* Empty */
    .settings-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 60px 24px; text-align: center; }
    .settings-empty-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--neutral-100); color: var(--text-muted); margin-bottom: 6px; }
    .settings-empty strong { font-size: 14px; color: var(--text); }
    .settings-empty span { font-size: 12px; color: var(--text-muted); max-width: 360px; line-height: 1.4; }

    /* Skeleton */
    .settings-skel-list { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
    .setting-row-skel { display: grid; grid-template-columns: 200px 1fr; gap: 14px; align-items: center; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; }
    .line-skel { height: 12px; border-radius: 4px; background: linear-gradient(90deg,var(--neutral-100) 25%,var(--neutral-50) 37%,var(--neutral-100) 63%); background-size: 400% 100%; animation: settings-shimmer 1.4s ease infinite; }
    .line-skel-key { width: 100%; }
    .line-skel-value { width: 100%; height: 10px; }
    @keyframes settings-shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

    /* Modal form layout */
    .form-group-full { grid-column: 1 / -1; }

    @media (max-width: 900px) {
      .settings-layout { grid-template-columns: 1fr; }
      .settings-scopes { position: static; max-height: none; flex-direction: row; overflow-x: auto; }
      .scopes-head { display: none; }
      .scope-item { white-space: nowrap; width: auto; flex-shrink: 0; }
      .scope-copy small { display: none; }
    }
    @media (max-width: 560px) {
      .settings-save-bar { flex-direction: column; align-items: stretch; }
      .settings-save-actions { justify-content: stretch; }
      .settings-save-actions .btn { flex: 1; }
      .settings-search .form-control { min-width: 0; width: 100%; }
    }
  `],
})
export class SettingsComponent implements OnInit {
  readonly SCOPES: ScopeDef[] = [
    { key: 'system', label: 'System', icon: 'shield', description: 'Core system configuration that affects every module.' },
    { key: 'general', label: 'General', icon: 'settings', description: 'School-wide preferences like name, logo, locale.' },
    { key: 'academics', label: 'Academics', icon: 'book', description: 'Academic year defaults, grading policy, term structure.' },
    { key: 'finance', label: 'Finance', icon: 'dollar', description: 'Fee rules, currency, invoice prefixes, late fine policy.' },
    { key: 'transport', label: 'Transport', icon: 'truck', description: 'Route defaults, vehicle capacity, monthly fee baseline.' },
    { key: 'library', label: 'Library', icon: 'book', description: 'Issue period, renewal limit, fine per day.' },
    { key: 'hostel', label: 'Hostel', icon: 'bed', description: 'Allocation policy, checkout time, mess rules.' },
    { key: 'communication', label: 'Communication', icon: 'megaphone', description: 'SMS gateway, email sender, notification defaults.' },
    { key: 'services', label: 'Services', icon: 'heart', description: 'Health, discipline, certificate, and visitor defaults.' },
    { key: 'administration', label: 'Administration', icon: 'users', description: 'User account policy, password rules, audit retention.' },
  ];

  scope = 'system';
  addScope = 'system';
  rows: SettingsRow[] = [];
  originalRows: SettingsRow[] = [];
  saving = false;
  loading = false;
  dirty = false;
  filter = '';
  showAddForm = false;
  newKey = '';
  newValue = '';
  newDescription = '';
  newScope = 'system';
  confirmTarget: SettingsRow | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService
  ) {}

  ngOnInit(): void { this.load(); }

  get currentScope(): ScopeDef | undefined {
    return this.SCOPES.find(s => s.key === this.scope);
  }

  get filteredRows(): SettingsRow[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.rows;
    return this.rows.filter(r => r.key.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
  }

  get validKey(): boolean { return /^[a-z][a-z0-9_]*$/.test(this.newKey); }
  get keyExists(): boolean {
    return this.rows.some(r => r.key === this.newKey) || false;
  }

  load(): void {
    this.loading = true;
    this.api.get<Record<string, unknown>>('/settings', { scope: this.scope }).subscribe({
      next: (res) => {
        const map = res?.data ?? {};
        this.rows = Object.entries(map).map(([key, raw]) => this.normalize(key, raw));
        this.originalRows = this.rows.map(r => ({ ...r }));
        this.dirty = false;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  private normalize(key: string, raw: unknown): SettingsRow {
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
  }

  changeScope(scope: string): void {
    if (scope === this.scope) return;
    this.scope = scope;
    this.filter = '';
    this.load();
  }

  countInScope(scope: string): string {
    // Count of settings per scope — only the current scope's count is known for sure,
    // so we show '~' for others to set expectations honestly.
    if (scope === this.scope) return String(this.rows.length);
    return '—';
  }

  markDirty(): void {
    this.dirty = JSON.stringify(this.rows) !== JSON.stringify(this.originalRows);
  }

  resetChanges(): void {
    this.rows = this.originalRows.map(r => ({ ...r }));
    this.dirty = false;
  }

  openAddForm(): void {
    this.newKey = '';
    this.newValue = '';
    this.newDescription = '';
    this.newScope = this.scope;
    this.showAddForm = true;
  }

  confirmAdd(): void {
    const key = (this.newKey || '').trim();
    if (!key || !this.validKey) return;
    if (this.rows.some(r => r.key === key)) {
      this.toasts.error('Key already exists in this scope');
      return;
    }
    // If the user added the setting to a different scope than the one currently
    // visible, switch to that scope so they see the new row appear.
    if (this.newScope !== this.scope) {
      this.scope = this.newScope;
      this.load();
      // After load(), add the new row on top so the user sees it.
      const sub = this.api.post('/settings/bulk', [{
        scope: this.newScope, key, value: this.newValue, isPublic: false, description: this.newDescription,
      }]).subscribe({
        next: () => {
          this.toasts.success('Setting added');
          this.showAddForm = false;
          this.load();
        },
        error: () => {},
      });
      return;
    }
    this.rows.push({ key, value: this.newValue, isPublic: false, description: this.newDescription });
    this.showAddForm = false;
    this.markDirty();
  }

  remove(row: SettingsRow): void { this.confirmTarget = row; }

  confirmRemove(): void {
    const row = this.confirmTarget;
    this.confirmTarget = null;
    if (!row) return;
    this.api.delete('/settings', { scope: this.scope, key: row.key }).subscribe({
      next: () => {
        this.rows = this.rows.filter(r => r.key !== row.key);
        this.originalRows = this.originalRows.filter(r => r.key !== row.key);
        this.toasts.success('Setting removed');
        this.markDirty();
      },
      error: () => {},
    });
  }

  saveAll(): void {
    const payload = this.rows.map(r => ({ scope: this.scope, key: r.key, value: r.value, isPublic: r.isPublic, description: r.description }));
    if (!payload.length) return;
    this.saving = true;
    this.api.post('/settings/bulk', payload).subscribe({
      next: () => {
        this.saving = false;
        this.originalRows = this.rows.map(r => ({ ...r }));
        this.dirty = false;
        this.toasts.success('Settings saved');
      },
      error: () => { this.saving = false; },
    });
  }

  pretty(s: string): string { return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
}
