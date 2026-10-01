function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing environment variable ${name} (see .env.example)`);
  }
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  get jwtSecret(): string {
    return required('JWT_SECRET', isProd ? undefined : 'dev-only-insecure-secret');
  },
};
