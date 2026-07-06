import axios from "axios";
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import type { TokenManager } from "./storage";

export interface SDKConfig {
  baseURL: string;
  timeout?: number;
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  tokenManager?: TokenManager;
  onUnauthorized?: () => void;
}

export class HttpClient {
  public readonly client: AxiosInstance;
  private tokenManager?: TokenManager;
  private configHeaders?: SDKConfig["headers"];

  constructor(config: SDKConfig) {
    this.tokenManager = config.tokenManager;
    this.configHeaders = config.headers;

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 10000,
      withCredentials: true,
      headers: typeof config.headers === "object" ? config.headers : undefined,
    });

    this.setupInterceptors(config);
  }

  private setupInterceptors(config: SDKConfig): void {
    // Request Interceptor: Resolve dynamic headers, auto-attach token and handle React Native FormData Content-Type
    this.client.interceptors.request.use(
      async (reqConfig: InternalAxiosRequestConfig) => {
        // Resolve dynamic/asynchronous headers if a function is configured
        if (typeof this.configHeaders === "function") {
          const dynamicHeaders = await this.configHeaders();
          Object.keys(dynamicHeaders).forEach((key) => {
            reqConfig.headers[key] = dynamicHeaders[key];
          });
        }

        if (this.tokenManager && !reqConfig.headers.Authorization) {
          const token = await this.tokenManager.getToken();
          if (token) {
            reqConfig.headers.Authorization = `Bearer ${token}`;
          }
        }

        // Automatic FormData handling for React Native and browser uploads
        if (reqConfig.data instanceof FormData) {
          reqConfig.headers["Content-Type"] = "multipart/form-data";
          // Bump default timeout for uploads
          if (reqConfig.timeout === (config.timeout ?? 10000)) {
            reqConfig.timeout = 60000;
          }
        }
        return reqConfig;
      },
      (error: unknown) => Promise.reject(error)
    );

    // Response Interceptor: Catch unauthorized requests (401)
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 401 && config.onUnauthorized) {
            config.onUnauthorized();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Performs an HTTP request and unwraps the response data, returning a Promise of type T.
   */
  public async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.client.request<T>(config);
    return response.data;
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({
      method: "GET",
      url,
      ...config,
    });
  }

  public async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return this.request<T>({
      method: "POST",
      url,
      data,
      ...config,
    });
  }

  public async patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return this.request<T>({
      method: "PATCH",
      url,
      data,
      ...config,
    });
  }

  public async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return this.request<T>({
      method: "PUT",
      url,
      data,
      ...config,
    });
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({
      method: "DELETE",
      url,
      ...config,
    });
  }

  /**
   * Adds a custom request interceptor.
   */
  public addRequestInterceptor(
    onFulfilled?: (
      value: InternalAxiosRequestConfig
    ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>,
    onRejected?: (error: unknown) => unknown
  ): number {
    return this.client.interceptors.request.use(onFulfilled, onRejected);
  }

  /**
   * Adds a custom response interceptor.
   */
  public addResponseInterceptor(
    onFulfilled?: (
      value: AxiosResponse
    ) => AxiosResponse | Promise<AxiosResponse>,
    onRejected?: (error: unknown) => unknown
  ): number {
    return this.client.interceptors.response.use(onFulfilled, onRejected);
  }

  /**
   * Updates base configurations dynamically at runtime.
   */
  public configure(updates: Partial<SDKConfig>): void {
    if (updates.baseURL !== undefined) {
      this.client.defaults.baseURL = updates.baseURL;
    }
    if (updates.timeout !== undefined) {
      this.client.defaults.timeout = updates.timeout;
    }
    if (updates.headers !== undefined) {
      if (typeof updates.headers === "object") {
        Object.assign(this.client.defaults.headers.common, updates.headers);
      }
      this.configHeaders = updates.headers;
    }
    if (updates.tokenManager !== undefined) {
      this.tokenManager = updates.tokenManager;
    }
  }
}
