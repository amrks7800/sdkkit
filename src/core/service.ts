import type { HttpClient } from "./client";

/**
 * Abstract class representing a modular microservice client.
 * All feature-specific services must extend this class.
 */
export abstract class BaseService {
  public readonly $isService = true;
  protected readonly http: HttpClient;
  protected abstract readonly basePath: string;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Prepends the service's basePath to the provided relative path segment.
   * If no path is provided, returns the basePath.
   */
  protected url(path: string = ""): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.basePath}${path ? cleanPath : ""}`;
  }
}
