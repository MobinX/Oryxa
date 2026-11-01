export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001').replace(
  /\/+$/,
  '',
);
