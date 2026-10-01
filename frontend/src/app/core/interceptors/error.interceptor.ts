import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, throwError } from 'rxjs';
import { catchError, switchMap, first } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { Router } from '@angular/router';
import { ToastService } from '../services/toast.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  // Shared refresh subject: all concurrent 401s subscribe to the same refresh result
  // so the user is logged out only when refresh actually fails (not when refresh is in-flight).
  private refresh$?: Subject<boolean>;

  constructor(
    private readonly auth: AuthService,
    private readonly storage: StorageService,
    private readonly router: Router,
    private readonly toasts: ToastService
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401 && !req.url.includes('/auth/login') && !req.url.includes('/auth/refresh')) {
          return this.tryRefresh().pipe(
            switchMap((ok) => {
              if (ok) {
                return next.handle(
                  req.clone({ setHeaders: { Authorization: `Bearer ${this.storage.accessToken}` } })
                );
              }
              this.auth.logout();
              return throwError(() => err);
            })
          );
        }

        // Suppress toast for /auth/refresh failures (already handled by the logout path).
        if (req.url.includes('/auth/refresh')) {
          return throwError(() => err);
        }

        const message = this.extractMessage(err);

        // A deactivated account keeps a valid token but every call returns 403: sign out cleanly.
        if (err.status === 403 && /account is disabled/i.test(message) && this.storage.accessToken) {
          this.toasts.error('Your account has been disabled. Please contact the administrator.');
          this.auth.logout();
          return throwError(() => err);
        }
        if (err.status === 0) {
          this.toasts.error('Cannot reach the server. Check your internet connection and try again.');
          return throwError(() => err);
        }
        if (err.status === 429) {
          this.toasts.error('Too many requests. Please wait a moment and try again.');
          return throwError(() => err);
        }
        if (err.status !== 401) this.toasts.error(message);
        return throwError(() => err);
      })
    );
  }

  /** Turn any error payload (string, validation array, object) into readable text. */
  private extractMessage(err: HttpErrorResponse): string {
    const body = err.error as unknown;
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object') {
      const b = body as { message?: unknown; errors?: unknown[]; error?: unknown };
      if (Array.isArray(b.errors) && b.errors.length) {
        const parts = b.errors
          .map((e) => (typeof e === 'string' ? e : (e as { message?: string })?.message))
          .filter((m): m is string => !!m);
        if (parts.length) return parts.join(', ');
      }
      if (typeof b.message === 'string' && b.message) return b.message;
      if (b.message) return JSON.stringify(b.message);
      if (typeof b.error === 'string' && b.error) return b.error;
    }
    return err.message || 'Request failed';
  }

  private tryRefresh(): Observable<boolean> {
    // If a refresh is already in flight, share its result instead of returning false.
    if (this.refresh$) return this.refresh$.asObservable().pipe(first());

    const subject = new Subject<boolean>();
    this.refresh$ = subject;

    this.auth.refresh().subscribe({
      next: (ok) => {
        this.refresh$ = undefined;
        subject.next(ok);
        subject.complete();
      },
      error: () => {
        this.refresh$ = undefined;
        subject.next(false);
        subject.complete();
      },
    });

    return subject.asObservable().pipe(first());
  }
}