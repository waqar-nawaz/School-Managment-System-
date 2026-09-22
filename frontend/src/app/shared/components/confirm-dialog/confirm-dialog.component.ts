import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-title">{{ title }}</div>
        <p style="color:var(--neutral-500)">{{ message }}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" (click)="close.emit()">Cancel</button>
          <button class="btn btn-danger" (click)="confirm.emit()">Confirm</button>
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