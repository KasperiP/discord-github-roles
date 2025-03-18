import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import 'dotenv/config';
import { createBot } from './bot/bot';
import { authRoutes } from './routes/auth';
import { PrismaClient } from '@prisma/client';
import { jsxRenderer } from 'hono/jsx-renderer';
import { IndexPage } from './pages/IndexPage';
import { getCookie, setCookie } from 'hono/cookie';
import { serveStatic } from '@hono/node-server/serve-static';
import { createChildLogger, logError } from './utils/logger';
import { config } from './config/config';
import { Scheduler } from './scheduler/scheduler';

const log = createChildLogger('app');

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
    log.debug('Home page accessed by unauthenticated user');
    return c.render(<IndexPage user={null} />);
  }

  try {
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
    
    if (user) {
      log.debug({ 
        userId, 
        hasDiscord: !!user.discordAccount, 
        hasGithub: !!user.gitHubAccount 
      }, 'Home page accessed by authenticated user');
    } else {
      log.warn({ userId }, 'Home page accessed with invalid user ID');
      // Clear invalid session
      setCookie(c, 'user_id', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
    }
    
    return c.render(<IndexPage user={user} />);
  } catch (error) {
    log.error({ 
      userId, 
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
    }, 'Error fetching user data for home page');
    return c.render(
      <IndexPage 
        user={null} 
        error="Failed to load user data. Please try again or contact support."
      />
    );
  }
});

if (!process.env.DISCORD_TOKEN) {
  log.error('DISCORD_TOKEN environment variable not set');
  throw new Error('DISCORD_TOKEN is required');
}

// Create and initialize the Discord bot
try {
  const client = createBot(process.env.DISCORD_TOKEN);
  
  // Initialize scheduler when the client is ready
  client.once('ready', () => {
    try {
      // Create the scheduler with configured interval
      const scheduler = new Scheduler(
        client,
        config.scheduler.syncIntervalHours
      );
      
      // Start the scheduler
      scheduler.start();
      
      log.info(
        { syncIntervalHours: config.scheduler.syncIntervalHours },
        'Role sync scheduler started'
      );
      
      // Expose scheduler for potential use in API endpoints
      app.get('/api/sync', async (c) => {
        // Only allow this in development or with proper authentication in production
        if (process.env.NODE_ENV !== 'production') {
          try {
            await scheduler.triggerSync();
            return c.json({ success: true, message: 'Manual sync triggered' });
          } catch (error) {
            logError(log, 'Error triggering manual sync', error);
            return c.json({ success: false, error: 'Failed to trigger sync' }, 500);
          }
        } else {
          return c.json({ success: false, error: 'Not authorized' }, 403);
        }
      });
    } catch (error) {
      logError(log, 'Failed to initialize scheduler', error);
    }
  });
} catch (error) {
  log.fatal({ 
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
  }, 'Failed to initialize Discord bot');
  process.exit(1);
}

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    log.info({ port: info.port }, `Server is running on http://localhost:${info.port}`);
  },
);
