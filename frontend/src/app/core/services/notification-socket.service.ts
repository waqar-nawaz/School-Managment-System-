import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';

export interface RealtimeNotification {
  id: number;
  userId: number;
  title: string;
  body: string;
  channel: string;
  data?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private started = false;
  private readonly notificationSubject = new BehaviorSubject<RealtimeNotification | null>(null);
  private readonly unreadSubject = new BehaviorSubject<number>(0);

  readonly notification$: Observable<RealtimeNotification | null> = this.notificationSubject.asObservable();
  readonly unread$: Observable<number> = this.unreadSubject.asObservable();

  constructor(
    private readonly storage: StorageService,
    private readonly router: Router,
    private readonly toasts: ToastService
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.socket?.close();
    this.socket = null;
    this.unreadSubject.next(0);
  }

  markSeen(): void {
    this.unreadSubject.next(0);
  }

  navigateFor(notification: RealtimeNotification): void {
    const data = notification.data ?? {};
    const explicit = String(data['route'] ?? '').trim();
    if (explicit.startsWith('/')) {
      void this.router.navigateByUrl(explicit);
      return;
    }
    const type = String(data['type'] ?? '').toLowerCase();
    const routes: Record<string, string> = {
      message: '/messages',
      leave: '/leaves',
      event: '/events',
      notice: '/notices',
      announcement: '/announcements',
      complaint: '/complaints',
      certificate: '/certificates',
      health: '/health-records',
      discipline: '/discipline-records',
      inventory: '/inventory',
      visitor: '/visitor-logs',
    };
    const route = routes[type];
    if (route) void this.router.navigateByUrl(route);
    else void this.router.navigateByUrl('/notifications');
  }

  private connect(): void {
    if (!this.started || this.socket || !this.storage.accessToken) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(protocol + '//' + window.location.host + '/ws/notifications');
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      socket.send(JSON.stringify({ type: 'auth', token: this.storage.accessToken }));
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; notification?: RealtimeNotification };
        if (message.type !== 'notification' || !message.notification) return;
        this.unreadSubject.next(this.unreadSubject.getValue() + 1);
        this.notificationSubject.next(message.notification);
        this.toasts.info(message.notification.title);
      } catch {
        // Ignore malformed socket messages.
      }
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.scheduleReconnect();
    };

    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (!this.started || !this.storage.accessToken || this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempt++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
