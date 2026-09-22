import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, concatMap, first, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { Router } from '@angular/router';
import { ToastService } from '../services/toast.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private refreshing = false;

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

        const message = err.error?.message || err.message || 'Request failed';
        if (err.status !== 401) this.toasts.error(message);
        return throwError(() => err);
      })
    );
  }

  private tryRefresh(): Observable<boolean> {
    if (this.refreshing) return of(false);
    this.refreshing = true;
    return this.auth.refresh().pipe(
      first(),
      concatMap((ok) => {
        this.refreshing = false;
        return of(ok);
      })
    );
  }
}