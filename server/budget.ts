import { AiError } from "./ai";
export class AiBudget {
  private day = "";
  private used = 0;
  constructor(
    private limit: number,
    private now: () => number = Date.now,
  ) {}
  take = () => {
    const now = this.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.used = 0;
    }
    if (this.used >= this.limit) {
      const error = new AiError(
        "The service's daily AI allowance has been reached. Please try again tomorrow. Example guides are still available.",
        429,
      );
      error.retryAfter = Math.max(
        1,
        Math.ceil((Date.parse(day + "T00:00:00Z") + 86400000 - now) / 1000),
      );
      throw error;
    }
    this.used++;
  };
}
