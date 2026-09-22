export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  meta?: PaginationMeta;
  errors?: Array<{ path: string; message: string }>;
}