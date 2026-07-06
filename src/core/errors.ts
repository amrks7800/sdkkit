import type { ApiErrorIssue } from "./types";

/**
 * Base SDK Error class.
 */
export class SDKError extends Error {
  public readonly status?: number;
  public readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "SDKError";
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a network or connection issue occurs.
 */
export class NetworkError extends SDKError {
  constructor(message: string, status?: number) {
    super(message, status, "NETWORK_ERROR");
    this.name = "NetworkError";
  }
}

/**
 * Error thrown when API validation fails.
 */
export class ValidationError extends SDKError {
  public readonly issues: ApiErrorIssue[];

  constructor(message: string, issues: ApiErrorIssue[], status?: number) {
    super(message, status, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.issues = issues;
  }
}
