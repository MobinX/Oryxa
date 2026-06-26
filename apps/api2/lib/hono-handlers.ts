import { handle } from 'hono/vercel';
import { app } from '@repo/api/app';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

type RouteHandler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;

const honoHandler = handle(app) as RouteHandler;

/** Re-export for Next.js App Router route files (see hono.dev/docs/getting-started/nextjs). */
export const GET = honoHandler;
export const POST = honoHandler;
export const PUT = honoHandler;
export const PATCH = honoHandler;
export const DELETE = honoHandler;
export const OPTIONS = honoHandler;
export const HEAD = honoHandler;
