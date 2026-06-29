type ApiErrorShape = {
  response?: {
    status?: number;
    data?: { message?: string | string[] };
  };
};

export function getApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error || typeof error !== 'object') return fallback;

  const err = error as ApiErrorShape;

  if (!err.response) {
    return 'Connection error. Please check your internet and try again.';
  }

  const status = err.response.status;
  const raw = err.response.data?.message;
  const backendMsg = Array.isArray(raw)
    ? raw[0]
    : typeof raw === 'string'
    ? raw
    : '';

  switch (status) {
    case 400:
    case 409:
    case 422:
      return backendMsg || 'Invalid request. Please check your input.';
    case 401:
      return 'Your session has expired. Please log in again.';
    case 403:
      return "You don't have permission to do this.";
    case 404:
      return backendMsg || 'Not found.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
      return 'Our servers are having an issue. Please try again shortly.';
    default:
      return backendMsg || fallback;
  }
}

export function isSessionExpired(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as ApiErrorShape).response?.status === 401;
}
