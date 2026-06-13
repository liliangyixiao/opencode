/// <reference types="expo/types" />

declare module "event-source-polyfill" {
  export class EventSourcePolyfill {
    constructor(url: string, options?: { headers?: Record<string, string> })
    onmessage: ((event: MessageEvent) => void) | null
    onerror: ((event: Event) => void) | null
    addEventListener(type: string, listener: (event: MessageEvent) => void): void
    close(): void
    readyState: number
  }
}
