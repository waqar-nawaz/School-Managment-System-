import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts$ | async; track toast.id) {
        <div class="toast toast-{{ toast.type }}">
          {{ toast.message }}
          <span style="cursor:pointer;margin-left:.6rem" (click)="toastService.remove(toast.id)">✕</span>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  constructor(readonly toastService: ToastService) {}
}