import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSubject = new BehaviorSubject<Toast[]>([]);
  toasts$: Observable<Toast[]> = this.toastsSubject.asObservable();

  show(message: string, type: ToastType = 'info'): void {
    const id = ++toastId;
    const toast: Toast = { id, message, type };
    this.toastsSubject.next([...this.toastsSubject.getValue(), toast]);
    setTimeout(() => this.remove(id), 3500);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  remove(id: number): void {
    this.toastsSubject.next(this.toastsSubject.getValue().filter((t) => t.id !== id));
  }
}