import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import 'dotenv/config';
import { createBot } from './bot/bot';
import { authRoutes } from './routes/auth';
import { PrismaClient } from '@prisma/client';
import { jsxRenderer } from 'hono/jsx-renderer';
import { IndexPage } from './pages/IndexPage';
import { getCookie } from 'hono/cookie';
import { serveStatic } from '@hono/node-server/serve-static';

// Initialize Prisma client
export const prisma = new PrismaClient();

const app = new Hono();

// Serve static files from the public directory
app.use('/*', serveStatic({ root: './public' }));

// Set up JSX renderer
app.use(
  jsxRenderer(({ children }) => {
    return (
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>GitHub & Discord Linking</title>
          <link rel="stylesheet" href="/styles.css" />
        </head>
        <body>{children}</body>
      </html>
    );
  })
);

// Register auth routes
app.route('', authRoutes);

// Home page route
app.get('/', async (c) => {
  const userId = getCookie(c, 'user_id');
  
  if (!userId) {
    return c.render(<IndexPage user={null} />);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      discordAccount: {
        select: {
          username: true,
          discordId: true,
        },
      },
      gitHubAccount: {
        select: {
          username: true,
          githubId: true,
        },
      },
    },
  });

  return c.render(<IndexPage user={user} />);
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
