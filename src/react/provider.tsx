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
  serviceInstance: T
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
            const queryClient = useQueryClient();
            const queryKey: unknown[] = [serviceKey, propKey];
            if (args !== undefined) {
              if (Array.isArray(args)) {
                queryKey.push(...args);
              } else {
                queryKey.push(args);
              }
            }
            return queryClient.invalidateQueries({ queryKey });
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
export function enhanceSDK<T>(sdk: T): EnhancedSDK<T> {
  const serviceCache = new Map<string | symbol, unknown>();

  return new Proxy(sdk as Record<string | symbol, unknown>, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (value && typeof value === "object" && (value instanceof BaseService || (value as Record<string, unknown>).$isService === true)) {
        if (!serviceCache.has(key)) {
          serviceCache.set(key, wrapServiceWithHooks(key as string, value as BaseService));
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

  const SDKProvider: React.FC<SDKProviderProps<T>> = ({
    sdk,
    setup,
    withQueryClient = true,
    children,
  }) => {
    // Memoize the initialization to run setup only when dependencies change
    const instance = React.useMemo(() => {
      const enhancedSdk = enhanceSDK(sdk);
      if (setup) {
        setup(enhancedSdk);
      }
      return enhancedSdk;
    }, [sdk, setup]);

    // Create a stable QueryClient instance for React Query integration
    const [queryClient] = React.useState(() => new QueryClient());

    const content = (
      <SDKContext.Provider value={instance}>{children}</SDKContext.Provider>
    );

    if (withQueryClient) {
      return (
        <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
      );
    }

    return content;
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
