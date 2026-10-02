import assert from "node:assert/strict";
import { registerAppServiceWorker, shouldRegisterServiceWorker } from "../src/lib/pwa.ts";

const realNavigator = globalThis.navigator;
const realLocation = globalThis.location;

assert.equal(shouldRegisterServiceWorker({ protocol: "https:", hostname: "you.ge" }), false, "registration requires a browser navigator");

let registeredUrl = null;
const listeners = new Map();
const registration = {
  waiting: null,
  installing: null,
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
};

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    serviceWorker: {
      controller: {},
      register: async (url) => {
        registeredUrl = url;
        return registration;
      },
    },
  },
});
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { protocol: "https:", hostname: "you.ge" },
});

assert.equal(shouldRegisterServiceWorker(globalThis.location), true, "https origins with serviceWorker support should register");
let onRegistered = false;
await registerAppServiceWorker({
  onRegistered() {
    onRegistered = true;
  },
});
assert.equal(registeredUrl, "/service-worker.js", "the portfolio should register its dedicated service worker path");
assert.equal(onRegistered, true, "the registration callback should run");
assert.equal(typeof listeners.get("updatefound"), "function", "registration should watch for updates");

Object.defineProperty(globalThis, "navigator", { configurable: true, value: realNavigator });
Object.defineProperty(globalThis, "location", { configurable: true, value: realLocation });

console.log("service worker registration tests passed");
