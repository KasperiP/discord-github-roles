import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import 'dotenv/config';
import { createBot } from './bot/bot';
import { authRoutes } from './routes/auth';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
export const prisma = new PrismaClient();

const app = new Hono();

// Register auth routes
app.route('', authRoutes);

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN is required');
}

createBot(process.env.DISCORD_TOKEN);

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
