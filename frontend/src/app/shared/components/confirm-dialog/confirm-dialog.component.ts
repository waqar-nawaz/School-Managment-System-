import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-title">{{ title }}</div>
        <p style="color:var(--neutral-500)">{{ message }}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" (click)="close.emit()"><app-icon name="x" [size]="14" /> Cancel</button>
          <button class="btn btn-danger" (click)="confirm.emit()"><app-icon name="check" [size]="14" /> Confirm</button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  @Input() title = 'Are you sure?';
  @Input() message = 'This action cannot be undone.';
  @Output() confirm = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
}