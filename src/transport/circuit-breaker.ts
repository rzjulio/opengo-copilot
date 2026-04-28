import { log } from "../utils/logger";

type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(failureThreshold = 5, resetTimeoutMs = 30000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  get isOpen(): boolean {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half-open";
        log("circuit-breaker", "Transitioning to half-open");
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    if (this.state !== "closed") {
      this.state = "closed";
      log("circuit-breaker", "Closed after success");
    }
  }

  recordFailure(): void {
    this.failures += 1;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold && this.state !== "open") {
      this.state = "open";
      log("circuit-breaker", `Opened after ${this.failures} failures`);
    }
  }
}