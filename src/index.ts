import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import 'dotenv/config';
import { createBot } from './bot/bot';

const app = new Hono();

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
    console.log('process.env.DISCORD_TOKEN', process.env.DISCORD_TOKEN);
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
