"use client";

import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { BaseService } from "../core/service";
import type { EnhancedSDK, EnhancedService } from "./types";

/**
 * Props for the generated SDK Provider component.
 */
export interface SDKProviderProps<T> {
  sdk: T;
  /**
   * Optional callback to customize or initialize the SDK instance upon rendering.
   */
  setup?: (sdk: EnhancedSDK<T>) => void;
  /**
   * If true, wraps the application tree inside a QueryClientProvider automatically.
   * Useful in monorepos to avoid "No QueryClient set" issues.
   * @default true
   */
  withQueryClient?: boolean;
  children: React.ReactNode;
}

/**
 * Return type of the createSDKProvider utility.
 */
export interface SDKProviderResult<T> {
  SDKProvider: React.FC<SDKProviderProps<T>>;
  useSDK: () => EnhancedSDK<T>;
}

/**
 * Runtime helper to wrap a service instance in a Proxy that dynamically attaches
 * React Query hooks to all method calls.
 */
export function wrapServiceWithHooks<T extends BaseService>(
  serviceKey: string,
  serviceInstance: T,
  queryClient?: QueryClient
): EnhancedService<T> {
  return new Proxy(serviceInstance, {
    get(target, propKey) {
      const originalValue = Reflect.get(target, propKey);
      if (typeof originalValue !== "function" || propKey === "constructor") {
        return originalValue;
      }

      // Return a wrapper function that behaves normally but has extra properties attached
      const enhancedFn = Object.assign(
        function (this: unknown, ...args: unknown[]) {
          return (originalValue as Function).apply(this === enhancedFn ? target : this, args);
        },
        {
          useQuery(...argsAndOpts: unknown[]) {
            const expectedParamCount = (originalValue as Function).length;
            let args = argsAndOpts;
            let options: Record<string, unknown> | undefined = undefined;

            // If we received more arguments than the function expects, the last one is options
            if (argsAndOpts.length > expectedParamCount) {
              options = argsAndOpts[argsAndOpts.length - 1] as Record<string, unknown>;
              args = argsAndOpts.slice(0, -1);
            } else if (argsAndOpts.length === expectedParamCount && expectedParamCount === 0) {
              // If expected is 0 and we passed 1 argument, it's options
              options = argsAndOpts[0] as Record<string, unknown>;
              args = [];
            } else if (argsAndOpts.length > 0) {
              // If we passed the same or fewer arguments than expected, let's check if the last argument is a react-query options object
              const lastArg = argsAndOpts[argsAndOpts.length - 1];
              if (
                lastArg &&
                typeof lastArg === "object" &&
                ("enabled" in lastArg ||
                  "staleTime" in lastArg ||
                  "refetchOnWindowFocus" in lastArg ||
                  "retry" in lastArg ||
                  "gcTime" in lastArg ||
                  "select" in lastArg ||
                  "initialData" in lastArg ||
                  "refetchInterval" in lastArg)
              ) {
                // This is options, which means the developer omitted some optional arguments in the middle
                options = lastArg as Record<string, unknown>;
                args = argsAndOpts.slice(0, -1);
              }
            }

            return useQuery({
              queryKey: [serviceKey, propKey, ...args],
              queryFn: () => (originalValue as Function).apply(target, args),
              ...options,
            });
          },

          useMutation(options?: unknown) {
            return useMutation({
              mutationFn: (variables: unknown) => {
                const paramCount = (originalValue as Function).length;
                if (paramCount === 0) {
                  return (originalValue as Function).call(target);
                }
                if (paramCount === 1) {
                  return (originalValue as Function).call(target, variables);
                }
                const args = Array.isArray(variables) ? variables : [variables];
                return (originalValue as Function).apply(target, args);
              },
              ...(options as Record<string, unknown>),
            });
          },

          invalidate(args?: unknown) {
            let client = queryClient;
            if (!client) {
              try {
                client = useQueryClient();
              } catch (e) {
                // Ignore
              }
            }
            if (!client) {
              throw new Error("No QueryClient found. Make sure you are using SDKProvider or passing queryClient to enhanceSDK.");
            }
            const queryKey: unknown[] = [serviceKey, propKey];
            if (args !== undefined) {
              if (Array.isArray(args)) {
                queryKey.push(...args);
              } else {
                queryKey.push(args);
              }
            }
            return client.invalidateQueries({ queryKey });
          },
        }
      );

      return enhancedFn;
    },
  }) as unknown as EnhancedService<T>;
}

/**
 * Recursively enhances an instantiated SDK, wrapping all of its services (BaseService subclasses) with React Query hooks.
 */
export function enhanceSDK<T>(sdk: T, queryClient?: QueryClient): EnhancedSDK<T> {
  const serviceCache = new Map<string | symbol, unknown>();

  return new Proxy(sdk as Record<string | symbol, unknown>, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (value && typeof value === "object" && (value instanceof BaseService || (value as Record<string, unknown>).$isService === true)) {
        if (!serviceCache.has(key)) {
          serviceCache.set(key, wrapServiceWithHooks(key as string, value as BaseService, queryClient));
        }
        return serviceCache.get(key);
      }
      return value;
    },
  }) as unknown as EnhancedSDK<T>;
}

/**
 * Creates a React Context Provider and hook for accessing the typed SDK instance.
 * Merges React state, context distribution, and optional TanStack Query integration.
 */
export function createSDKProvider<T>(): SDKProviderResult<T> {
  const SDKContext = React.createContext<EnhancedSDK<T> | null>(null);

  const SDKProviderWithClient: React.FC<Omit<SDKProviderProps<T>, "withQueryClient">> = ({
    sdk,
    setup,
    children,
  }) => {
    const [queryClient] = React.useState(() => new QueryClient());
    const instance = React.useMemo(() => {
      const enhancedSdk = enhanceSDK(sdk, queryClient);
      if (setup) {
        setup(enhancedSdk);
      }
      return enhancedSdk;
    }, [sdk, setup, queryClient]);

    return (
      <QueryClientProvider client={queryClient}>
        <SDKContext.Provider value={instance}>{children}</SDKContext.Provider>
      </QueryClientProvider>
    );
  };

  const SDKProviderWithoutClient: React.FC<Omit<SDKProviderProps<T>, "withQueryClient">> = ({
    sdk,
    setup,
    children,
  }) => {
    const queryClient = useQueryClient();
    const instance = React.useMemo(() => {
      const enhancedSdk = enhanceSDK(sdk, queryClient);
      if (setup) {
        setup(enhancedSdk);
      }
      return enhancedSdk;
    }, [sdk, setup, queryClient]);

    return (
      <SDKContext.Provider value={instance}>{children}</SDKContext.Provider>
    );
  };

  const SDKProvider: React.FC<SDKProviderProps<T>> = ({
    sdk,
    setup,
    withQueryClient = true,
    children,
  }) => {
    if (withQueryClient) {
      return (
        <SDKProviderWithClient sdk={sdk} setup={setup}>
          {children}
        </SDKProviderWithClient>
      );
    }
    return (
      <SDKProviderWithoutClient sdk={sdk} setup={setup}>
        {children}
      </SDKProviderWithoutClient>
    );
  };

  const useSDK = (): EnhancedSDK<T> => {
    const context = React.useContext(SDKContext);
    if (!context) {
      throw new Error("useSDK must be used within an SDKProvider");
    }
    return context;
  };

  return {
    SDKProvider,
    useSDK,
  };
}
