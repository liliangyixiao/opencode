import { describe, expect, test } from "bun:test"
import { localHealthcheckHostname, mobileServerHostname } from "./mobile-server"

describe("mobile server startup", () => {
  test("listens on loopback unless mobile access is enabled", () => {
    expect(mobileServerHostname(false)).toBe("127.0.0.1")
    expect(mobileServerHostname(true)).toBe("0.0.0.0")
  })

  test("checks local health through loopback even when listening on all interfaces", () => {
    expect(localHealthcheckHostname("0.0.0.0")).toBe("127.0.0.1")
    expect(localHealthcheckHostname("127.0.0.1")).toBe("127.0.0.1")
  })
})
