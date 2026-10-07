import { Component, Inject, Injector, OnInit, OnDestroy, ApplicationRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { Subscription, filter, first, from, merge, interval } from 'rxjs';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';
import { NotificationSocketService } from './core/services/notification-socket.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent],
  template: `
    <router-outlet />
    <app-toast-container />

    <!-- New version banner — shown when the service worker has downloaded a newer
         build but is waiting for the user to apply it. Clicking Reload activates
         the new version immediately without requiring the user to close all tabs. -->
    @if (updateReady) {
      <div class="update-banner" role="alertdialog" aria-live="assertive">
        <div class="update-banner-inner">
          <div class="update-banner-copy">
            <strong>A new version is available</strong>
            <span>Reload to use the latest EduSuite — your data is safe.</span>
          </div>
          <div class="update-banner-actions">
            <button type="button" class="btn btn-ghost btn-sm update-dismiss" (click)="dismissUpdate()">Later</button>
            <button type="button" class="btn btn-primary btn-sm" (click)="applyUpdate()">Reload now</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .update-banner {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: 20px;
      z-index: 9999;
      width: min(560px, calc(100% - 32px));
      background: var(--primary, #145374);
      color: #fff;
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
      animation: update-slide-in 0.25s ease;
    }
    @keyframes update-slide-in {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to   { transform: translate(-50%, 0);    opacity: 1; }
    }
    .update-banner-inner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
    }
    .update-banner-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .update-banner-copy strong { font-size: 13px; font-weight: 700; }
    .update-banner-copy span { font-size: 11px; opacity: 0.85; }
    .update-banner-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .update-banner-actions .btn-sm { font-size: 12px; padding: 6px 10px; }
    .update-dismiss {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.3);
    }
    .update-dismiss:hover { background: rgba(255, 255, 255, 0.2); }
    @media (max-width: 480px) {
      .update-banner { bottom: 12px; }
      .update-banner-inner { flex-direction: column; align-items: stretch; padding: 12px; gap: 10px; }
      .update-banner-actions { justify-content: stretch; }
      .update-banner-actions .btn { flex: 1; }
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  updateReady = false;
  private subs: Subscription[] = [];
  private dismissedForThisVersion = false;

  constructor(
    public readonly theme: ThemeService,
    private readonly auth: AuthService,
    private readonly notificationSocket: NotificationSocketService,
    private readonly swUpdate: SwUpdate,
    private readonly appRef: ApplicationRef,
    private readonly injector: Injector,
  ) {
    this.auth.user$.subscribe((user) => {
      if (user) this.notificationSocket.start();
      else this.notificationSocket.stop();
    });
  }

  ngOnInit(): void {
    // Only attempt SW update flows when the service worker is enabled (production).
    // In dev mode SwUpdate is a no-op — calling versionUpdates would throw.
    if (!environment.enableServiceWorker || !this.swUpdate.isEnabled) return;

    // 1. Listen for the Angular-emitted 'VERSION_READY' event. This fires when the
    //    service worker has finished downloading a new app bundle and is ready to
    //    activate it. We surface a non-blocking banner instead of forcing a reload
    //    so the user can finish what they're doing first.
    const ready$ = this.swUpdate.versionUpdates.pipe(
      filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
    );
    this.subs.push(
      ready$.subscribe((evt) => {
        // Don't show the prompt if the user already dismissed this exact version.
        // Without this check, reopening the app would re-prompt every time.
        const newHash = evt.latestVersion?.hash;
        const oldHash = evt.currentVersion?.hash;
        if (this.dismissedForThisVersion && newHash === oldHash) return;
        // If the user dismissed this exact version before, skip the prompt.
        if (this.dismissedForThisVersion && this.lastSeenHash === newHash) return;
        this.lastSeenHash = newHash;
        this.updateReady = true;
      }),
    );

    // 2. Recover from unrecoverable SW states (corrupted cache, broken update chain).
    //    The Angular docs recommend a full page reload in this scenario.
    this.subs.push(
      this.swUpdate.unrecoverable.subscribe(() => {
        // Unrecoverable state — silent reload is the safest recovery.
        if (typeof window !== 'undefined') window.location.reload();
      }),
    );

    // 3. Check for updates on app stability + every 30 minutes while the app is open.
    //    Without this polling, an installed PWA that the user never closes would
    //    never discover new versions. (Background sync isn't reliable across browsers.)
    const appStable$ = this.appRef.isStable.pipe(first((stable) => stable));
    const periodic$ = interval(30 * 60 * 1000);
    this.subs.push(
      merge(appStable$, periodic$).subscribe(() => {
        this.swUpdate.checkForUpdate().catch(() => undefined);
      }),
    );
  }

  private lastSeenHash: string | undefined;

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.subs = [];
  }

  dismissUpdate(): void {
    this.updateReady = false;
    this.dismissedForThisVersion = true;
  }

  applyUpdate(): void {
    // Force-activate the new version. On modern browsers this also triggers a
    // navigation reload in the SW; on older browsers we fall back to a manual reload.
    this.swUpdate.activateUpdate()
      .then(() => {
        if (typeof window !== 'undefined') window.location.reload();
      })
      .catch(() => {
        // Activation failed (rare) — reload anyway so the user gets a clean state.
        if (typeof window !== 'undefined') window.location.reload();
      });
  }
}
