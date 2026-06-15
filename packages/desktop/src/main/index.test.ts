import { describe, expect, test } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { createWindowBeforeLoadingSettles, forwardInitializationFailure } from "./initialization"

describe("desktop initialization", () => {
  const failure = new Error("sidecar startup failed")
  const expectFailure = (exit: Exit.Exit<unknown, unknown>) => {
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) return
    expect(Cause.squash(exit.cause)).toBe(failure)
  }

  test("forwards loading task failures before renderer initialization", () => {
    const exit = Effect.runSync(
      Effect.gen(function* () {
        const initialization = yield* Deferred.make<never, unknown>()
        yield* forwardInitializationFailure(initialization)(Effect.die(failure)).pipe(Effect.exit)
        return yield* Deferred.await(initialization).pipe(Effect.exit)
      }),
    )

    expectFailure(exit)
  })

  test("forwards loading task failures while renderer initialization waits", () => {
    const exit = Effect.runSync(
      Effect.gen(function* () {
        const initialization = yield* Deferred.make<never, unknown>()
        const waiting = yield* Deferred.await(initialization).pipe(Effect.exit, Effect.forkChild)
        yield* forwardInitializationFailure(initialization)(Effect.die(failure)).pipe(Effect.exit)
        return yield* Fiber.join(waiting)
      }),
    )

    expectFailure(exit)
  })

  test("creates the window before waiting for local server startup", async () => {
    const createdBeforeStartupFinished = await Effect.runPromise(
      Effect.gen(function* () {
        const startupFinished = yield* Deferred.make<void>()
        const loadingTask = yield* Deferred.await(startupFinished).pipe(Effect.forkChild)
        let created = false

        const waiting = yield* createWindowBeforeLoadingSettles(loadingTask, () => {
          created = true
        }).pipe(Effect.forkChild)
        yield* Effect.sleep(0)

        const result = created
        yield* Deferred.succeed(startupFinished, undefined)
        yield* Fiber.join(waiting)
        return result
      }),
    )

    expect(createdBeforeStartupFinished).toBe(true)
  })
})
