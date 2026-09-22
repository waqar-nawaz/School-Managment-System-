import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEnvelope } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  get<T>(path: string, params?: Record<string, unknown>): Observable<ApiEnvelope<T>> {
    return this.http.get<ApiEnvelope<T>>(`${this.apiUrl}${path}`, { params: this.toParams(params) });
  }

  post<T>(path: string, body?: unknown): Observable<ApiEnvelope<T>> {
    return this.http.post<ApiEnvelope<T>>(`${this.apiUrl}${path}`, body ?? {});
  }

  put<T>(path: string, body?: unknown): Observable<ApiEnvelope<T>> {
    return this.http.put<ApiEnvelope<T>>(`${this.apiUrl}${path}`, body ?? {});
  }

  patch<T>(path: string, body?: unknown): Observable<ApiEnvelope<T>> {
    return this.http.patch<ApiEnvelope<T>>(`${this.apiUrl}${path}`, body ?? {});
  }

  delete<T>(path: string, params?: Record<string, unknown>): Observable<ApiEnvelope<T>> {
    return this.http.delete<ApiEnvelope<T>>(`${this.apiUrl}${path}`, { params: this.toParams(params) });
  }

  download(path: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}${path}`, { responseType: 'blob' });
  }

  private toParams(params?: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!params) return out;
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined || v === '') continue;
      out[k] = String(v);
    }
    return out;
  }
}