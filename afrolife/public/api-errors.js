export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function optionalApiFallback(error, fallback) {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return fallback;
  }
  throw error;
}
