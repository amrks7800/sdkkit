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
  >
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
  useQuery: (...args: UseQueryArgs<TFunc>) => UseQueryResult<Awaited<ReturnType<TFunc>>, Error>;
  useMutation: (
    options?: Omit<
      UseMutationOptions<Awaited<ReturnType<TFunc>>, Error, MutationVariables<TFunc>>,
      "mutationFn"
    >
  ) => UseMutationResult<Awaited<ReturnType<TFunc>>, Error, MutationVariables<TFunc>>;
  invalidate: (args?: Partial<Parameters<TFunc>>) => Promise<void>;
};

/**
 * Maps all methods of a service to their enhanced counterparts.
 */
export type EnhancedService<TService> = {
  readonly [K in keyof TService]: TService[K] extends (...args: any[]) => any
    ? EnhancedMethod<TService[K]>
    : TService[K];
};

/**
 * Maps all services within the SDK instance to their enhanced counterparts.
 */
export type EnhancedSDK<TSDK> = {
  readonly [K in keyof TSDK]: TSDK[K] extends Record<string, any>
    ? EnhancedService<TSDK[K]>
    : TSDK[K];
};
