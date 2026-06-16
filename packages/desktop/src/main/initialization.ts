import { Deferred, Effect, Fiber } from "effect"

export function forwardInitializationFailure<A>(initialization: Deferred.Deferred<A, unknown>) {
  return <B, E, R>(effect: Effect.Effect<B, E, R>) =>
    effect.pipe(Effect.tapCause((cause) => Deferred.failCause(initialization, cause)))
}

// Create the window synchronously, then keep the main Effect alive while the
// forked server-startup task runs. If we return from the root Effect right
// after forking, Effect cancels the unawaited child fiber and the sidecar
// never starts — leaving the renderer stuck on the splash/logo screen.
export function createWindowBeforeLoadingSettles<A, E>(
  loadingTask: Fiber.Fiber<A, E>,
  createWindow: () => void,
) {
  return Effect.sync(createWindow).pipe(Effect.andThen(Fiber.await(loadingTask)))
}
