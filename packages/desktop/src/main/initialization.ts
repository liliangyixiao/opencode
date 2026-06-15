import { Deferred, Effect, Fiber } from "effect"

export function forwardInitializationFailure<A>(initialization: Deferred.Deferred<A, unknown>) {
  return <B, E, R>(effect: Effect.Effect<B, E, R>) =>
    effect.pipe(Effect.tapCause((cause) => Deferred.failCause(initialization, cause)))
}

export function createWindowBeforeLoadingSettles<A, E>(
  loadingTask: Fiber.Fiber<A, E>,
  createWindow: () => void,
) {
  return Effect.sync(createWindow).pipe(Effect.andThen(Fiber.await(loadingTask)))
}
