import { JSDOM } from "jsdom";

// Manually initialize JSDOM if running in a non-browser environment (e.g., bun test without custom runner configs)
if (typeof window === "undefined") {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).navigator = dom.window.navigator;
  (global as any).location = dom.window.location;
}

import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createSDK } from "../factory/create-sdk";
import { BaseService } from "../core/service";
import { enhanceSDK, createSDKProvider } from "./provider";

// Mock Service for Testing
class MockProductsService extends BaseService {
  protected readonly basePath = "/products";

  public async getMyProducts() {
    return [{ id: "1", name: "Product 1" }];
  }

  public async getProductById(id: string) {
    return { id, name: `Product ${id}` };
  }

  public async createProduct(data: { name: string }) {
    return { id: "2", name: data.name };
  }
}

describe("Proxy-Based Auto-Hooks", () => {
  let sdk: ReturnType<typeof createSDK<{ products: typeof MockProductsService }>>;

  beforeEach(() => {
    sdk = createSDK({
      config: { baseURL: "http://mock-api.com" },
      services: {
        products: MockProductsService,
      },
    });
  });

  it("should wrap service methods with hook helper properties", () => {
    const enhancedSdk = enhanceSDK(sdk);

    expect(enhancedSdk.products.getMyProducts.useQuery).toBeTypeOf("function");
    expect(enhancedSdk.products.getMyProducts.useMutation).toBeTypeOf("function");
    expect(enhancedSdk.products.getMyProducts.invalidate).toBeTypeOf("function");
  });

  it("should execute useQuery and retrieve data successfully in renderHook", async () => {
    const enhancedSdk = enhanceSDK(sdk);
    
    // Set up QueryClient wrapper
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Call the dynamic hook
    const { result } = renderHook(() => enhancedSdk.products.getMyProducts.useQuery(), { wrapper });

    // Wait for the query to resolve
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ id: "1", name: "Product 1" }]);
  });

  it("should pass arguments to query functions correctly", async () => {
    const enhancedSdk = enhanceSDK(sdk);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => enhancedSdk.products.getProductById.useQuery("456"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "456", name: "Product 456" });
  });

  it("should execute useMutation and resolve data successfully", async () => {
    const enhancedSdk = enhanceSDK(sdk);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => enhancedSdk.products.createProduct.useMutation(), { wrapper });

    result.current.mutate({ name: "New Product Name" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "2", name: "New Product Name" });
  });

  it("should invalidate query successfully", async () => {
    const queryClient = new QueryClient();
    const enhancedSdk = enhanceSDK(sdk, queryClient);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => enhancedSdk.products.getMyProducts.useQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Call invalidate and check if it successfully invalidates or at least doesn't throw
    expect(() => enhancedSdk.products.getMyProducts.invalidate()).not.toThrow();
  });

  it("should support invalidate through SDKProvider and useSDK", async () => {
    const { SDKProvider, useSDK } = createSDKProvider<typeof sdk>();

    let invalidateFn: Function | undefined;

    const TestComponent = () => {
      const enhancedSdk = useSDK();
      invalidateFn = enhancedSdk.products.getMyProducts.invalidate;
      
      const { data } = enhancedSdk.products.getMyProducts.useQuery();
      return <div>{data ? data[0].name : "loading"}</div>;
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SDKProvider sdk={sdk}>{children}</SDKProvider>
    );

    renderHook(() => TestComponent(), { wrapper });

    await waitFor(() => expect(invalidateFn).toBeDefined());
    expect(() => invalidateFn!()).not.toThrow();
  });
});
