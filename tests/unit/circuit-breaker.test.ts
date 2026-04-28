import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker } from "../../src/transport/circuit-breaker";

describe("CircuitBreaker", () => {
  it("starts closed", () => {
    const cb = new CircuitBreaker(3, 1000);
    expect(cb.isOpen).toBe(false);
  });

  it("opens after threshold failures", () => {
    const cb = new CircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen).toBe(true);
  });

  it("closes after success in half-open", () => {
    const cb = new CircuitBreaker(2, 50);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen).toBe(true);

    // Wait for reset timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb.isOpen).toBe(false); // half-open
        cb.recordSuccess();
        expect(cb.isOpen).toBe(false); // closed
        resolve();
      }, 100);
    });
  });

  it("resets failure count on success", () => {
    const cb = new CircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
  });
});
