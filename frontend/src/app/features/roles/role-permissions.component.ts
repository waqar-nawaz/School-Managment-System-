import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface RoleRow { name: string; label?: string; isSystem?: boolean }
interface Group { name: string; keys: string[] }

/** Roles & Permissions: pick a role, tick what it may do, save. Changes apply immediately. */
@Component({
  selector: 'app-role-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Roles &amp; Permissions</h1>
        <p class="page-subtitle">Choose a role, tick what it is allowed to do, then save. Changes apply immediately.</p>
      </div>
      @if (canEdit) {
        <div class="page-actions">
          <button class="btn btn-primary" (click)="showNew = true"><app-icon name="plus" [size]="15" /> New role</button>
        </div>
      }
    </div>

    <div class="rp-layout">
      <div class="card rp-roles">
        @for (r of roles; track r.name) {
          <button type="button" class="rp-role" [class.active]="r.name === selected" (click)="select(r.name)">
            <span>{{ r.label || pretty(r.name) }}</span>
            <small>{{ countOf(r.name) }}</small>
          </button>
        } @empty { <div class="empty-cell">{{ loading ? 'Loading…' : 'No roles.' }}</div> }
      </div>

      <div class="card rp-editor">
        @if (!selected) {
          <div class="empty-cell">Select a role on the left.</div>
        } @else {
          <div class="card-toolbar">
            <div>
              <h3 class="card-title" style="margin:0">{{ pretty(selected) }}</h3>
              @if (fullAccess) { <div class="form-hint">This role has full access to everything and cannot be restricted.</div> }
              @else if (!canEdit) { <div class="form-hint">You can view but not change permissions.</div> }
            </div>
            @if (!fullAccess) {
              <div class="search-box"><input class="form-control" placeholder="Search permissions…" [(ngModel)]="filter" /></div>
            }
          </div>

          @if (!fullAccess) {
            @for (g of visibleGroups(); track g.name) {
              <div class="rp-group">
                <div class="rp-group-head">
                  <strong>{{ pretty(g.name) }}</strong>
                  @if (canEdit) {
                    <button type="button" class="btn btn-sm btn-ghost" (click)="toggleGroup(g)">{{ allOn(g) ? 'Clear' : 'Select all' }}</button>
                  }
                </div>
                <div class="rp-keys">
                  @for (k of g.keys; track k) {
                    <label class="rp-key" [class.on]="draft.has(k)">
                      <input type="checkbox" [checked]="draft.has(k)" [disabled]="!canEdit" (change)="toggle(k)" />
                      {{ action(k) }}
                    </label>
                  }
                </div>
              </div>
            } @empty { <div class="empty-cell">No permissions match “{{ filter }}”.</div> }

            @if (canEdit) {
              <div class="modal-actions" style="position:sticky;bottom:0;background:var(--card-bg, #fff);padding-top:.75rem">
                @if (dirty) { <span class="form-hint" style="margin-right:auto">Unsaved changes</span> }
                <button class="btn btn-ghost" [disabled]="!dirty || saving" (click)="reset()">Undo</button>
                <button class="btn btn-primary" [disabled]="!dirty || saving" (click)="save()">
                  <app-icon name="check" [size]="14" /> {{ saving ? 'Saving…' : 'Save permissions' }}
                </button>
              </div>
            }
          }
        }
      </div>
    </div>

    @if (showNew) {
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">New role</div>
            <button type="button" class="modal-close" (click)="showNew = false" aria-label="Close"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Role name *</label>
              <input class="form-control" [(ngModel)]="newName" placeholder="exam_officer" />
              <div class="form-hint">Lowercase letters, numbers and underscores.</div>
            </div>
            <div class="form-group">
              <label>Display label</label>
              <input class="form-control" [(ngModel)]="newLabel" placeholder="Exam Officer" />
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="showNew = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="!validNewName" (click)="createRole()">Create role</button>
          </div>
        </div>
      </div>
    }

    @if (confirmLeave) {
      <app-confirm-dialog
        title="Discard changes?"
        message="You have unsaved permission changes for this role. Discard them?"
        (confirm)="doLeave()"
        (close)="confirmLeave = null" />
    }
  `,
  styles: [`
    .rp-layout { display: grid; grid-template-columns: 240px 1fr; gap: 1rem; align-items: start; }
    .rp-roles { padding: .5rem; position: sticky; top: 1rem; }
    .rp-role { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: .6rem .75rem;
      border: 0; background: transparent; border-radius: 8px; cursor: pointer; text-align: left; color: inherit; }
    .rp-role:hover { background: rgba(127,127,127,.12); }
    .rp-role.active { background: var(--primary, #4f46e5); color: #fff; }
    .rp-role small { opacity: .75; }
    .rp-group { border: 1px solid rgba(127,127,127,.25); border-radius: 10px; padding: .75rem; margin-bottom: .75rem; }
    .rp-group-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
    .rp-keys { display: flex; flex-wrap: wrap; gap: .5rem; }
    .rp-key { display: inline-flex; gap: .35rem; align-items: center; padding: .3rem .6rem; border-radius: 999px;
      border: 1px solid rgba(127,127,127,.35); cursor: pointer; font-size: .85rem; }
    .rp-key.on { background: rgba(79,70,229,.12); border-color: var(--primary, #4f46e5); }
    @media (max-width: 800px) { .rp-layout { grid-template-columns: 1fr; } .rp-roles { position: static; display: flex; overflow-x: auto; } .rp-role { white-space: nowrap; width: auto; } }
  `],
})
export class RolePermissionsComponent implements OnInit {
  roles: RoleRow[] = [];
  matrix: Record<string, string[]> = {};
  catalogue: string[] = [];
  selected = '';
  draft = new Set<string>();
  filter = '';
  loading = true;
  saving = false;
  showNew = false;
  newName = '';
  newLabel = '';
  confirmLeave: string | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toasts: ToastService,
    private readonly perms: PermissionService
  ) {}

  get canEdit(): boolean { return this.perms.hasPermission('roles:update') && !this.fullAccess; }
  get fullAccess(): boolean { return (this.matrix[this.selected] ?? []).includes('*'); }
  get validNewName(): boolean { return /^[a-z][a-z0-9_]{1,48}$/.test(this.newName); }
  get dirty(): boolean {
    const saved = new Set((this.matrix[this.selected] ?? []).filter((k) => k !== '*'));
    if (saved.size !== this.draft.size) return true;
    for (const k of this.draft) if (!saved.has(k)) return true;
    return false;
  }

  ngOnInit(): void { this.load(); }

  load(keepSelection = true): void {
    this.loading = true;
    this.api.get<Array<{ name: string; label?: string; isSystem?: boolean }>>('/roles', { limit: 100 }).subscribe({
      next: (r) => (this.roles = (r?.data ?? []).filter((x) => x.name !== 'super_admin')),
      error: () => {},
    });
    this.api.get<Array<{ key: string }>>('/roles/permissions/list').subscribe({
      next: (r) => { this.catalogue = (r?.data ?? []).map((p) => p.key).filter((k) => k !== '*'); this.rebuildCatalogue(); },
      error: () => {},
    });
    this.api.get<Record<string, string[]>>('/roles/matrix').subscribe({
      next: (r) => {
        this.matrix = r?.data ?? {};
        this.loading = false;
        this.rebuildCatalogue();
        const keep = keepSelection && this.selected && this.matrix[this.selected];
        this.select(keep ? this.selected : (this.roles[0]?.name ?? Object.keys(this.matrix).find((n) => n !== 'super_admin') ?? ''), true);
      },
      error: () => (this.loading = false),
    });
  }

  private rebuildCatalogue(): void {
    const all = new Set(this.catalogue);
    for (const list of Object.values(this.matrix)) for (const k of list) if (k !== '*') all.add(k);
    this.catalogue = Array.from(all).sort();
  }

  select(name: string, force = false): void {
    if (!force && name !== this.selected && this.dirty) { this.confirmLeave = name; return; }
    this.selected = name;
    this.reset();
  }
  doLeave(): void { const n = this.confirmLeave; this.confirmLeave = null; if (n) { this.selected = n; this.reset(); } }

  reset(): void {
    this.draft = new Set((this.matrix[this.selected] ?? []).filter((k) => k !== '*'));
  }

  countOf(role: string): string {
    const l = this.matrix[role] ?? [];
    return l.includes('*') ? 'All' : String(l.length);
  }

  groups(): Group[] {
    const by = new Map<string, string[]>();
    for (const k of this.catalogue) {
      const g = k.split(':')[0];
      if (!by.has(g)) by.set(g, []);
      by.get(g)!.push(k);
    }
    return Array.from(by, ([name, keys]) => ({ name, keys })).sort((a, b) => a.name.localeCompare(b.name));
  }
  visibleGroups(): Group[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.groups();
    return this.groups().map((g) => ({ name: g.name, keys: g.keys.filter((k) => k.toLowerCase().includes(q)) })).filter((g) => g.keys.length);
  }

  toggle(k: string): void { this.draft.has(k) ? this.draft.delete(k) : this.draft.add(k); this.draft = new Set(this.draft); }
  allOn(g: Group): boolean { return g.keys.every((k) => this.draft.has(k)); }
  toggleGroup(g: Group): void {
    const on = this.allOn(g);
    for (const k of g.keys) on ? this.draft.delete(k) : this.draft.add(k);
    this.draft = new Set(this.draft);
  }

  save(): void {
    this.saving = true;
    this.api.put(`/roles/${this.selected}/permissions`, Array.from(this.draft)).subscribe({
      next: () => {
        this.matrix[this.selected] = Array.from(this.draft);
        this.saving = false;
        this.toasts.success(`${this.pretty(this.selected)} permissions saved`);
      },
      error: () => (this.saving = false),
    });
  }

  createRole(): void {
    this.api.post('/roles', { name: this.newName, label: this.newLabel || this.pretty(this.newName) }).subscribe({
      next: () => {
        this.showNew = false;
        const created = this.newName;
        this.newName = ''; this.newLabel = '';
        this.toasts.success('Role created. Now choose what it can do.');
        this.selected = created;
        this.matrix[created] = [];
        this.load();
      },
      error: () => {},
    });
  }

  pretty(s: string): string { return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  action(k: string): string { return k.includes(':') ? k.split(':').slice(1).join(':') : k; }
}
