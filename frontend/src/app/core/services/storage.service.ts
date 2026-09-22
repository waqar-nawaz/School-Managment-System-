import { Injectable } from '@angular/core';

const ACCESS_KEY = 'sms_access_token';
const REFRESH_KEY = 'sms_refresh_token';

@Injectable({ providedIn: 'root' })
export class StorageService {
  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  setTokens(access: string, refresh: string, remember = true): void {
    if (remember) {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    } else {
      sessionStorage.setItem(ACCESS_KEY, access);
      sessionStorage.setItem(REFRESH_KEY, refresh);
    }
  }

  updateAccess(token: string): void {
    localStorage.setItem(ACCESS_KEY, token);
  }

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  }
}