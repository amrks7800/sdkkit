import type {
  UseQueryOptions,
  UseQueryResult,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";

/**
 * Extracts and maps parameters of a service method to hook options and arguments.
 */
export type UseQueryArgs<TFunc extends (...args: any[]) => any> = [
  ...args: Parameters<TFunc>,
  options?: Omit<
    UseQueryOptions<Awaited<ReturnType<TFunc>>, Error>,
    "queryKey" | "queryFn"
  >,
];

/**
 * Maps function parameters to Mutation variables.
 * - 0 args: void
 * - 1 arg: the arg type itself (e.g. string)
 * - >1 args: a tuple of the arguments
 */
export type MutationVariables<TFunc extends (...args: any[]) => any> =
  Parameters<TFunc> extends []
    ? void
    : Parameters<TFunc> extends [infer Single]
      ? Single
      : Parameters<TFunc>;

/**
 * The enhanced signature for a service method, attaching query, mutation, and invalidation helpers.
 */
export type EnhancedMethod<TFunc extends (...args: any[]) => any> = TFunc & {
  useQuery: (
    ...args: UseQueryArgs<TFunc>
  ) => UseQueryResult<Awaited<ReturnType<TFunc>>, Error>;
  useMutation: (
    options?: Omit<
      UseMutationOptions<
        Awaited<ReturnType<TFunc>>,
        Error,
        MutationVariables<TFunc>
      >,
      "mutationFn"
    >,
  ) => UseMutationResult<
    Awaited<ReturnType<TFunc>>,
    Error,
    MutationVariables<TFunc>
  >;
  invalidate: (...args: Parameters<TFunc>) => Promise<void>;
};

/**
 * Maps all public methods of a service to their enhanced counterparts.
 * Non-function properties are preserved as-is.
 */
export type EnhancedService<TService> = {
  readonly [K in keyof TService]: TService[K] extends (...args: any[]) => any
    ? EnhancedMethod<TService[K]>
    : TService[K];
};

/**
 * Keys from the SDK instance that should NOT be enhanced (core SDK infrastructure).
 * These are properties added by createSDK() itself, not user-defined services.
 */
type SDKInfrastructureKeys = "http" | "configure" | "addRequestInterceptor" | "addResponseInterceptor";

/**
 * Checks if a type looks like a service object (has at least one function property).
 * Uses structural typing (duck typing) rather than nominal class checks to avoid
 * declaration file duplication issues where BaseService from dist/index.d.ts
 * differs from BaseService in dist/react.d.ts.
 */
type IsServiceLike<T> = T extends object
  ? T extends (...args: any[]) => any
    ? false  // Functions themselves are not services
    : true
  : false;

/**
 * Maps all service-like instances within the SDK to their enhanced counterparts.
 * Non-service properties (http, configure, interceptors) are preserved as-is.
 *
 * Uses structural (duck-type) checks instead of nominal `extends BaseService`
 * to work correctly across separate declaration file boundaries.
 */
export type EnhancedSDK<TSDK> = {
  readonly [K in keyof TSDK]: K extends SDKInfrastructureKeys
    ? TSDK[K]
    : IsServiceLike<TSDK[K]> extends true
      ? EnhancedService<TSDK[K]>
      : TSDK[K];
};
