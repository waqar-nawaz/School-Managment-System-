import { Injectable } from '@angular/core';

const ACCESS_KEY = 'sms_access_token';
const REFRESH_KEY = 'sms_refresh_token';

@Injectable({ providedIn: 'root' })
export class StorageService {
  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(ACCESS_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
  }

  setTokens(access: string, refresh: string, remember = true): void {
    const primary = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    primary.setItem(ACCESS_KEY, access);
    primary.setItem(REFRESH_KEY, refresh);
    other.removeItem(ACCESS_KEY);
    other.removeItem(REFRESH_KEY);
  }

  /** Update both tokens in whichever storage currently holds the session. */
  updateTokens(access: string, refresh: string): void {
    const store = localStorage.getItem(REFRESH_KEY) ? localStorage : sessionStorage;
    store.setItem(ACCESS_KEY, access);
    if (refresh) store.setItem(REFRESH_KEY, refresh);
  }

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  }
}
