import { getStore } from "./store"
import { MOBILE_SERVER_ENABLED_KEY } from "./store-keys"

export function mobileServerHostname(enabled: boolean) {
  return enabled ? "0.0.0.0" : "127.0.0.1"
}

export function localHealthcheckHostname(hostname: string) {
  return hostname === "0.0.0.0" ? "127.0.0.1" : hostname
}

export function getMobileServerEnabled() {
  return getStore().get(MOBILE_SERVER_ENABLED_KEY) === true
}

export function setMobileServerEnabled(enabled: boolean) {
  getStore().set(MOBILE_SERVER_ENABLED_KEY, enabled)
}
