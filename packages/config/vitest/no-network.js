// Unit tests must not reach the network (Constitution XV). Any test that needs HTTP
// stubs `fetch` itself with `vi.stubGlobal("fetch", ...)`; unstubbed calls fail loudly.
globalThis.fetch = () => {
  throw new Error(
    "Network access is not allowed in unit tests. Stub fetch with vi.stubGlobal, or move the test to *.int.test.ts.",
  );
};
