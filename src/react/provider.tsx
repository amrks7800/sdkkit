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
import type { EnhancedSDK } from "./types";

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
export function wrapServiceWithHooks(serviceKey: string, serviceInstance: any): any {
  return new Proxy(serviceInstance, {
    get(target, propKey) {
      const originalValue = target[propKey];
      if (typeof originalValue !== "function" || propKey === "constructor") {
        return originalValue;
      }

      // Return a wrapper function that behaves normally but has extra properties attached
      const enhancedFn = function (this: any, ...args: any[]) {
        return originalValue.apply(this === enhancedFn ? target : this, args);
      };

      // 1. Attach useQuery
      enhancedFn.useQuery = function (...argsAndOpts: any[]) {
        const expectedParamCount = originalValue.length;
        let args = argsAndOpts;
        let options: any = undefined;

        // If we received more arguments than the function expects, the last one is options
        if (argsAndOpts.length > expectedParamCount) {
          options = argsAndOpts[argsAndOpts.length - 1];
          args = argsAndOpts.slice(0, -1);
        } else if (argsAndOpts.length === expectedParamCount && expectedParamCount === 0) {
          // If expected is 0 and we passed 1 argument, it's options
          options = argsAndOpts[0];
          args = [];
        } else if (argsAndOpts.length > 0) {
          // If we passed the same or fewer arguments than expected, let's check if the last argument is a react-query options object
          const lastArg = argsAndOpts[argsAndOpts.length - 1];
          if (
            lastArg &&
            typeof lastArg === "object" &&
            (lastArg.enabled !== undefined ||
              lastArg.staleTime !== undefined ||
              lastArg.refetchOnWindowFocus !== undefined ||
              lastArg.retry !== undefined ||
              lastArg.gcTime !== undefined ||
              lastArg.select !== undefined ||
              lastArg.initialData !== undefined ||
              lastArg.refetchInterval !== undefined)
          ) {
            // This is options, which means the developer omitted some optional arguments in the middle
            options = lastArg;
            args = argsAndOpts.slice(0, -1);
          }
        }

        return useQuery({
          queryKey: [serviceKey, propKey, ...args],
          queryFn: () => originalValue.apply(target, args),
          ...options,
        });
      };

      // 2. Attach useMutation
      enhancedFn.useMutation = function (options?: any) {
        return useMutation({
          mutationFn: (variables: any) => {
            const paramCount = originalValue.length;
            if (paramCount === 0) {
              return originalValue.call(target);
            }
            if (paramCount === 1) {
              return originalValue.call(target, variables);
            }
            const args = Array.isArray(variables) ? variables : [variables];
            return originalValue.apply(target, args);
          },
          ...options,
        });
      };

      // 3. Attach invalidate
      enhancedFn.invalidate = function (args?: any) {
        const queryClient = useQueryClient();
        const queryKey = [serviceKey, propKey];
        if (args !== undefined) {
          if (Array.isArray(args)) {
            queryKey.push(...args);
          } else {
            queryKey.push(args);
          }
        }
        return queryClient.invalidateQueries({ queryKey });
      };

      return enhancedFn;
    },
  });
}

/**
 * Recursively enhances an instantiated SDK, wrapping all of its services (BaseService subclasses) with React Query hooks.
 */
export function enhanceSDK<T>(sdk: T): EnhancedSDK<T> {
  const serviceCache = new Map<string | symbol, any>();

  return new Proxy(sdk as any, {
    get(target, key) {
      const value = target[key];
      if (value && typeof value === "object" && value instanceof BaseService) {
        if (!serviceCache.has(key)) {
          serviceCache.set(key, wrapServiceWithHooks(key as string, value));
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
