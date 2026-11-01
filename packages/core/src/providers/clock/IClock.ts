// The clock port (contracts/providers.md): code that depends on the time reads it from here, so
// tests can fix the time instead of waiting on the real clock (constitution XV).

export interface IClock {
  now(): Date;
}
