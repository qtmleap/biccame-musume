import {
  type MutateOptions,
  type MutationFunctionContext,
  type UseMutateFunction,
  type UseMutationOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient
} from '@tanstack/react-query'
import { useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { auth } from '@/lib/firebase'

/** Immutable mutation context remains valid only during its initiating account scope. */
export const isCurrentAccountMutation = (context: MutationFunctionContext): boolean => {
  const scope = context.meta?.accountScope
  return (
    typeof scope === 'object' &&
    scope !== null &&
    'active' in scope &&
    scope.active === true &&
    'uid' in scope &&
    scope.uid === (auth.currentUser === null ? null : auth.currentUser.uid)
  )
}

const guardCallbacks = <TData, TError, TVariables, TContext>(
  callbacks: MutateOptions<TData, TError, TVariables, TContext>
) => ({
  ...callbacks,
  onSuccess: (...args: Parameters<NonNullable<typeof callbacks.onSuccess>>) => {
    if (isCurrentAccountMutation(args[3])) return callbacks.onSuccess?.(...args)
  },
  onError: (...args: Parameters<NonNullable<typeof callbacks.onError>>) => {
    if (isCurrentAccountMutation(args[3])) return callbacks.onError?.(...args)
  },
  onSettled: (...args: Parameters<NonNullable<typeof callbacks.onSettled>>) => {
    if (isCurrentAccountMutation(args[4])) return callbacks.onSettled?.(...args)
  }
})

/** Keep TanStack's observer lifecycle, but detach and hide old account results. */
export const useAccountMutation = <TData, TError = Error, TVariables = void, TContext = unknown>(
  resource: string,
  options: UseMutationOptions<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> => {
  const { user } = useAuth()
  const client = useQueryClient()
  const uid = user === null ? null : user.uid
  const scopeRef = useRef({ uid, active: true, started: false })
  if (scopeRef.current.uid !== uid) {
    scopeRef.current.active = false
    scopeRef.current = { uid, active: true, started: false }
  }
  const scope = scopeRef.current
  // Retire a scope on UID replacement, rather than ordinary component unmount:
  // same-account hook callbacks must still finish shared-state updates after navigation.

  const meta = { ...options.meta, accountScope: scope, persist: false }
  const mutationKey = ['user', uid, 'mutation', resource] as const
  const initiatingContext = useMemo<MutationFunctionContext>(
    () => ({
      client,
      mutationKey: ['user', uid, 'mutation', resource],
      meta: { accountScope: scope }
    }),
    [client, uid, resource, scope]
  )
  const onMutate = options.onMutate
  const mutation = useMutation<TData, TError, TVariables, TContext>({
    ...options,
    onSuccess: (...args: Parameters<NonNullable<typeof options.onSuccess>>) => {
      if (isCurrentAccountMutation(args[3])) return options.onSuccess?.(...args)
    },
    onError: (...args: Parameters<NonNullable<typeof options.onError>>) => {
      if (isCurrentAccountMutation(args[3])) return options.onError?.(...args)
    },
    onSettled: (...args: Parameters<NonNullable<typeof options.onSettled>>) => {
      if (isCurrentAccountMutation(args[4])) return options.onSettled?.(...args)
    },
    mutationKey,
    meta,
    throwOnError: (error) =>
      isCurrentAccountMutation(initiatingContext) &&
      scope.started &&
      (typeof options.throwOnError === 'function' ? options.throwOnError(error) : options.throwOnError === true),
    onMutate: onMutate
      ? (variables, context) => {
          if (!isCurrentAccountMutation(context)) throw new Error('アカウントが変更されました')
          return onMutate(variables, context)
        }
      : undefined,
    mutationFn: async (variables, context) => {
      if (!isCurrentAccountMutation(context)) throw new Error('アカウントが変更されました')
      if (!options.mutationFn) throw new Error('Mutation function is missing')
      const data = await options.mutationFn(variables, context)
      if (!isCurrentAccountMutation(context)) throw new Error('アカウントが変更されました')
      return data
    }
  })
  const { mutate: originalMutate, mutateAsync: originalMutateAsync, reset: originalReset } = mutation
  const mutate = useCallback<UseMutateFunction<TData, TError, TVariables, TContext>>(
    (...args) => {
      if (!isCurrentAccountMutation(initiatingContext)) return
      scope.started = true
      if (args[1]) args[1] = guardCallbacks(args[1])
      originalMutate(...args)
    },
    [originalMutate, scope, initiatingContext]
  )
  const mutateAsync = useCallback<typeof mutation.mutateAsync>(
    async (...args) => {
      if (!isCurrentAccountMutation(initiatingContext)) throw new Error('アカウントが変更されました')
      scope.started = true
      if (args[1]) args[1] = guardCallbacks(args[1])
      return originalMutateAsync(...args)
    },
    [originalMutateAsync, scope, initiatingContext]
  )
  const reset = useCallback(() => {
    scope.started = false
    originalReset()
  }, [scope, originalReset])
  const result = { ...mutation, mutate, mutateAsync, reset }
  if (scope.started) return result
  // mutationKey changes reset the observer in TanStack's effect. Mask its previous
  // data/variables immediately, including the render before that effect runs.
  return {
    ...result,
    status: 'idle',
    data: undefined,
    variables: undefined,
    context: undefined,
    error: null,
    failureReason: null,
    failureCount: 0,
    submittedAt: 0,
    isIdle: true,
    isPending: false,
    isError: false,
    isSuccess: false,
    isPaused: false
  }
}
