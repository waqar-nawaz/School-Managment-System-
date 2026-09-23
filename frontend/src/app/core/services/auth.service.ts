import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, catchError, of, map } from 'rxjs';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { LoginPayload, LoginResult, User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSubject = new BehaviorSubject<User | null>(null);
  user$: Observable<User | null> = this.userSubject.asObservable();

  constructor(
    private readonly api: ApiService,
    private readonly storage: StorageService,
    private readonly router: Router
  ) {}

  get user(): User | null {
    return this.userSubject.getValue();
  }

  login(payload: LoginPayload): Observable<LoginResult> {
    return this.api.post<LoginResult>('/auth/login', payload).pipe(
      map((env) => env.data),
      tap((res) => {
        this.storage.setTokens(res.accessToken, res.refreshToken, payload.rememberMe);
        this.userSubject.next(res.user);
      })
    );
  }

  refresh(): Observable<boolean> {
    const rt = this.storage.refreshToken;
    if (!rt) return of(false);
    return this.api.post<LoginResult>('/auth/refresh', { refreshToken: rt }).pipe(
      map((env) => {
        // The backend rotates the refresh token on every refresh — persist both.
        this.storage.updateTokens(env.data.accessToken, env.data.refreshToken);
        this.userSubject.next(env.data.user);
        return true;
      }),
      catchError(() => of(false))
    );
  }

  loadProfile(): Observable<User | null> {
    return this.api.get<User>('/auth/me').pipe(
      map((env) => env.data),
      tap((u) => this.userSubject.next(u)),
      catchError(() => {
        this.userSubject.next(null);
        return of(null);
      })
    );
  }

  logout(): void {
    const rt = this.storage.refreshToken;
    if (rt) {
      this.api.post('/auth/logout', { refreshToken: rt }).subscribe({ error: () => undefined });
    }
    this.storage.clear();
    this.userSubject.next(null);
    this.router.navigate(['/auth/login']);
  }

  isLoggedIn(): boolean {
    return !!this.storage.accessToken;
  }
}