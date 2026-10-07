import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';
import { NotificationSocketService } from './core/services/notification-socket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent],
  template: `
    <router-outlet />
    <app-toast-container />
  `,
})
export class AppComponent {
  constructor(
    public readonly theme: ThemeService,
    private readonly auth: AuthService,
    private readonly notificationSocket: NotificationSocketService
  ) {
    this.auth.user$.subscribe((user) => {
      if (user) this.notificationSocket.start();
      else this.notificationSocket.stop();
    });
  }
}
