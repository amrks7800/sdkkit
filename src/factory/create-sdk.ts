import { HttpClient } from "../core/client";
import type { SDKConfig } from "../core/client";
import type { BaseService } from "../core/service";

/**
 * Constructor type for services that inherit from BaseService.
 */
export type ServiceConstructor<S extends BaseService = BaseService> = new (
  http: HttpClient
) => S;

/**
 * A dictionary of Service Constructor classes.
 */
export type ServiceMap = Record<string, ServiceConstructor>;

/**
 * Utility type to infer instantiated service types from a ServiceMap configuration.
 */
export type ServiceInstances<T extends ServiceMap> = {
  readonly [K in keyof T]: InstanceType<T[K]>;
};

/**
 * The combined interface of the created SDK, merging all instantiated services
 * with core HttpClient helpers.
 */
export type SDKInstance<T extends ServiceMap> = ServiceInstances<T> & {
  readonly http: HttpClient;
  configure(updates: Partial<SDKConfig>): void;
  addRequestInterceptor: HttpClient["addRequestInterceptor"];
  addResponseInterceptor: HttpClient["addResponseInterceptor"];
};

/**
 * Creates a fully typed, modular SDK instance from a mapping of service constructors.
 * Highly scalable, uses TypeScript type inference to map service classes to instance properties.
 */
export function createSDK<T extends ServiceMap>(options: {
  config: SDKConfig;
  services: T;
}): SDKInstance<T> {
  const http = new HttpClient(options.config);
  const services = {} as Record<string, BaseService>;

  Object.keys(options.services).forEach((key) => {
    const ServiceClass = options.services[key];
    services[key] = new ServiceClass(http);
  });

  const sdkInstance = Object.assign(services, {
    http,
    configure: (updates: Partial<SDKConfig>) => http.configure(updates),
    addRequestInterceptor: http.addRequestInterceptor.bind(http),
    addResponseInterceptor: http.addResponseInterceptor.bind(http),
  });

  return sdkInstance as unknown as SDKInstance<T>;
}

