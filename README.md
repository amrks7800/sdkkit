# sdkkit 🛠️

`sdkkit` is a type-safe meta-framework for building custom, production-ready REST SDKs for **React** and **React Native** applications.

It bundles the best patterns of HTTP clients, storage abstractions, React context providers, and automatic Postman collection generators into a single lightweight toolkit.

---

## 📦 Features

- **Core HttpClient**: Wraps `axios` and automatically unwraps response payload data (`Promise<T>`).
- **BaseService Class**: Provides structured paths, making API definition clean and DRY.
- **Zero-Boilerplate SDK Factory**: Instantiates multiple service modules with full type inference.
- **Auth Token Management**: Platform-agnostic storage adapters with built-in memory caching.
- **React context provider builder**: Generates type-safe React Context Providers and `useSDK()` hooks.
- **Postman Generator CLI & Programmatic API**: Deeply parses TypeScript types via `ts-morph` AST to generate request/response examples and Postman collections.
- **100% Strict Type Safety**: Written from the ground up without using any `any` or type-assertion workarounds.

---

## 🚀 Getting Started

### 1. Installation

Install `sdkkit` alongside its peer dependencies:

```bash
npm install sdkkit axios react @tanstack/react-query
```

---

## 🛠️ Step-by-Step SDK Construction

### Step 1: Define API Services

Create microservices that extend `BaseService`. You can co-locate API calls and TanStack Query hooks in the same class:

```typescript
// services/VehiclesService.ts
import { BaseService, type ApiResponse } from "sdkkit";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Vehicle {
  id: string;
  make: string;
  model: string;
}

export interface CreateVehicleDto {
  make: string;
  model: string;
}

export class VehiclesService extends BaseService {
  protected readonly basePath = "/vehicles";

  // --- Core API Calls ---

  public async getMyVehicles(): Promise<ApiResponse<Vehicle[]>> {
    return this.http.get<ApiResponse<Vehicle[]>>(this.url("/my"));
  }

  public async getById(id: string): Promise<ApiResponse<Vehicle>> {
    return this.http.get<ApiResponse<Vehicle>>(this.url(`/${id}`));
  }

  public async create(data: CreateVehicleDto): Promise<ApiResponse<Vehicle>> {
    return this.http.post<ApiResponse<Vehicle>>(this.url(), data);
  }

  // --- TanStack Query Integration ---

  public useQueryMy() {
    return useQuery({
      queryKey: ["vehicles", "my"],
      queryFn: () => this.getMyVehicles(),
    });
  }

  public useCreateMutation() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: CreateVehicleDto) => this.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      },
    });
  }
}
```

### Step 2: Initialize Token Manager and Create the SDK Instance

Assemble the SDK using the `createSDK` factory. This automatically creates an instantiated facade of services with full type inference:

```typescript
// sdk.ts
import { createSDK, TokenManager } from "sdkkit";
import { createSDKProvider } from "sdkkit/react";
import { VehiclesService } from "./services/VehiclesService";
import AsyncStorage from "@react-native-async-storage/async-storage"; // or localStorage in web

// Set up platform token storage (React Native example)
const tokenManager = new TokenManager({
  storage: AsyncStorage,
  storageKey: "user_auth_token",
});

export const sdk = createSDK({
  config: {
    baseURL: "https://api.myproject.com/api",
    tokenManager,
    onUnauthorized: () => {
      console.log("Session expired. Redirecting to login...");
    },
  },
  services: {
    vehicles: VehiclesService,
  },
});

// Generate typed Provider and useSDK hook
export const { SDKProvider, useSDK } = createSDKProvider<typeof sdk>();
```

### 💡 Better Auth Integration (Web & Mobile/Expo)

`sdkkit` fully supports **Better Auth** session credentials.

#### Web (Automatic Session Propagation)
Since `sdkkit`'s underlying HTTP client runs with `withCredentials: true` by default, browser cookies (including Better Auth session cookies) are automatically sent and received on every request. No configuration is required.

#### Mobile / React Native (Expo Cookie Header Injection)
Mobile platforms do not have automatic cookie managers. Better Auth provides an Expo/mobile client that allows retrieving active session headers via `authClient.getHeaders()` or `authClient.getCookies()`.

Configure the SDK using a dynamic async `headers` resolver:

```typescript
import { createSDK } from "sdkkit";
import { authClient } from "./auth-client"; // Your Better Auth mobile client

export const sdk = createSDK({
  config: {
    baseURL: "https://api.myproject.com/api",
    // Evaluated dynamically before every HTTP request:
    headers: async () => {
      const authHeaders = await authClient.getHeaders();
      return authHeaders ?? {};
    },
  },
  services: {
    vehicles: VehiclesService,
  },
});
```

### Step 3: Wire Context Provider in Application Root

Wrap your React/React Native application with the generated provider:

```tsx
// App.tsx
import React from "react";
import { sdk, SDKProvider } from "./sdk";
import { MainScreen } from "./screens/MainScreen";

export default function App() {
  return (
    <SDKProvider sdk={sdk} withQueryClient={true}>
      <MainScreen />
    </SDKProvider>
  );
}
```

### Step 4: Access Anywhere inside Components

```tsx
// screens/MainScreen.tsx
import React from "react";
import { useSDK } from "../sdk";

export function MainScreen() {
  const sdk = useSDK();
  const { data: response, isLoading } = sdk.vehicles.useQueryMy();
  const createVehicle = sdk.vehicles.useCreateMutation();

  if (isLoading) return <p>Loading...</p>;

  return (
    <div>
      {response?.data?.map(v => (
        <p key={v.id}>{v.make} - {v.model}</p>
      ))}
      <button onClick={() => createVehicle.mutate({ make: "Toyota", model: "Corolla" })}>
        Add Vehicle
      </button>
    </div>
  );
}
```

---

## 📑 Postman Collection Generation

Generate fully detailed Postman collections (v2.1.0) with recursive request/response body schemas and path variables directly from your TypeScript service source code.

### Option A: CLI Tool (Best for Build Pipelines)

Use the CLI script built into `sdkkit`:

```bash
npx sdkkit generate-postman \
  --tsconfig ./tsconfig.json \
  --services "src/services/**/*.ts" \
  --name "My Project API" \
  --base-url "https://api.myproject.com/api" \
  --output ./postman_collection.json
```

#### CLI Options
| Argument | Description | Default |
|---|---|---|
| `--tsconfig <path>` | Path to your TypeScript configuration file | `./tsconfig.json` |
| `--services <glob>` | Glob pattern identifying service class files | `src/services/**/*.ts` |
| `--name <string>` | Name of the generated Postman collection | `API Collection` |
| `--base-url <url>` | Value of the `{{baseUrl}}` variable in Postman | `http://localhost:3000/api` |
| `--output <path>` | JSON file path where the collection is written | `./postman_collection.json` |

### Option B: Programmatic API

Import the generator module to compile collections inside custom JS scripts:

```typescript
// scripts/generate-postman.ts
import { generatePostmanCollection } from "sdkkit/codegen";

generatePostmanCollection({
  tsConfigPath: "./tsconfig.json",
  serviceGlobs: ["src/services/**/*.ts"],
  collectionName: "Locator CRM API",
  baseUrl: "https://crm.homelocator.net/api",
  outputPath: "./postman_collection.json",
});
```

---

## 🛡️ License

MIT
