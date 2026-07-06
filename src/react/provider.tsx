import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Props for the generated SDK Provider component.
 */
export interface SDKProviderProps<T> {
  sdk: T;
  /**
   * Optional callback to customize or initialize the SDK instance upon rendering.
   */
  setup?: (sdk: T) => void;
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
  useSDK: () => T;
}

/**
 * Creates a React Context Provider and hook for accessing the typed SDK instance.
 * Merges React state, context distribution, and optional TanStack Query integration.
 */
export function createSDKProvider<T>(): SDKProviderResult<T> {
  const SDKContext = React.createContext<T | null>(null);

  const SDKProvider: React.FC<SDKProviderProps<T>> = ({
    sdk,
    setup,
    withQueryClient = true,
    children,
  }) => {
    // Memoize the initialization to run setup only when dependencies change
    const instance = React.useMemo(() => {
      if (setup) {
        setup(sdk);
      }
      return sdk;
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

  const useSDK = (): T => {
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
