/**
 * Represents a single field-level error issue.
 */
export interface ApiErrorIssue {
  path: (string | number)[];
  message: string;
  code?: string;
}

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: ApiErrorIssue[];
}

/**
 * Pagination metadata.
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  skip: number;
  hasMore: boolean;
}

/**
 * Paginated data envelope.
 */
export interface PaginatedData<T> {
  items: T[];
  metadata: PaginationMeta;
}

/**
 * Standard paginated API response.
 */
export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

/**
 * React Native file representation for FormData uploads.
 */
export interface SdkImage {
  uri: string;
  type: string;
  name: string;
}

/**
 * Universal file wrapper supporting standard Web File objects and React Native file configurations.
 */
export type UniversalFile = File | SdkImage;
