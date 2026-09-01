import { JSDOM } from 'jsdom'

// Node 26 defines its own `localStorage` global, which is undefined unless the
// process was started with --localstorage-file. It shadows the one Vitest's
// jsdom environment would otherwise expose, so `window.localStorage` comes back
// undefined and nothing that touches storage can run.
//
// Lifting the store off a real JSDOM instance gives the genuine implementation
// rather than a hand-rolled stand-in - including `Storage.prototype`, which the
// storage tests spy on to simulate a full quota.
if (!globalThis.localStorage) {
  const { window } = new JSDOM('', { url: 'http://localhost:3000' })

  Object.defineProperty(globalThis, 'localStorage', {
    value: window.localStorage,
    configurable: true,
    writable: true
  })
  globalThis.Storage = window.Storage
}
