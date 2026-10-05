export class RequestError extends Error {
  retryAfter?: number;
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "RequestError";
  }
}
