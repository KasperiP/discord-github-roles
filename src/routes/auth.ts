import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { nanoid } from 'nanoid';
import { prisma } from '../index';
import { config } from '../config/config';
import { createChildLogger, logError } from '../utils/logger';
import { generateToken, verifyToken } from '../utils/jwt';

// Create a logger instance for the auth component
const log = createChildLogger('auth');

export const authRoutes = new Hono();

// Constants for OAuth
const DISCORD_API_URL = 'https://discord.com/api/v10';
const GITHUB_API_URL = 'https://github.com';
const GITHUB_API_VERSION = 'v3';
const REDIRECT_URI_BASE = config.baseUrl;

// Set secure cookie options
const getSecureCookieOptions = (maxAge: number = 60 * 60 * 24 * 7) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge,
});

// Discord OAuth endpoints
authRoutes.get('/auth/discord', async (c) => {
  // Generate and store state for CSRF protection
  const state = nanoid();
  setCookie(c, 'discord_oauth_state', state, {
    ...getSecureCookieOptions(60 * 10), // 10 minutes
  });

  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: `${REDIRECT_URI_BASE}/auth/discord/callback`,
    response_type: 'code',
    state,
    scope: 'identify',
  });

  log.info({ state }, 'Initiating Discord OAuth flow');
  return c.redirect(`${DISCORD_API_URL}/oauth2/authorize?${params.toString()}`);
});

authRoutes.get('/auth/discord/callback', async (c) => {
  const { code, state } = c.req.query();
  const storedState = getCookie(c, 'discord_oauth_state');
  const authToken = getCookie(c, 'auth_token');
  let userId: string | null = null;

  // Check if user is already authenticated
  if (authToken) {
    const payload = verifyToken(authToken);
    if (payload) {
      userId = payload.userId;
    }
  }

  const callbackLog = log.child({
    state,
    hasStoredState: !!storedState,
    hasExistingUserId: !!userId,
  });

  callbackLog.info('Processing Discord OAuth callback');

  // Validate state to prevent CSRF attacks
  if (!state || !storedState || state !== storedState) {
    callbackLog.warn('Invalid state parameter in Discord callback');
    return c.text('Invalid state parameter', 400);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${REDIRECT_URI_BASE}/auth/discord/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      logError(
        callbackLog,
        'Discord token exchange error',
        new Error(errorData),
        {
          status: tokenResponse.status,
        },
      );
      return c.text('Failed to exchange code for token', 500);
    }

    const tokenData = await tokenResponse.json();
    callbackLog.debug('Successfully obtained Discord access token');

    // Get user info from Discord
    const userResponse = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      logError(
        callbackLog,
        'Failed to get user info from Discord',
        new Error('API Error'),
        {
          status: userResponse.status,
        },
      );
      return c.text('Failed to get user info', 500);
    }

    const userData = await userResponse.json();
    const userLog = callbackLog.child({
      discordId: userData.id,
      discordUsername: userData.username,
    });
    userLog.info('Retrieved Discord user data');

    // Check if Discord account already exists
    const existingDiscordAccount = await prisma.discordAccount.findUnique({
      where: { discordId: userData.id },
      include: { user: true },
    });

    // Case 1: Discord account exists - login to that account
    if (existingDiscordAccount) {
      userLog.info(
        { existingUserId: existingDiscordAccount.userId },
        'Found existing Discord account',
      );
      // Update the Discord account with fresh username if needed
      await prisma.discordAccount.update({
        where: { id: existingDiscordAccount.id },
        data: {
          username: userData.username,
          updatedAt: new Date(),
        },
      });

      // Generate JWT token and set in cookie
      const token = generateToken(existingDiscordAccount.userId);
      setCookie(c, 'auth_token', token, getSecureCookieOptions());

      userLog.info('Successfully logged in with existing Discord account');
      return c.redirect('/');
    }

    // Case 2: User already logged in (has userId) - link Discord to existing account
    if (userId) {
      // Check if the user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        // Clear invalid session
        setCookie(c, 'auth_token', '', {
          ...getSecureCookieOptions(0),
        });

        return c.text('Invalid user session. Please try again.', 400);
      }

      // Create new Discord account linked to existing user
      await prisma.discordAccount.create({
        data: {
          discordId: userData.id,
          username: userData.username,
          user: { connect: { id: userId } },
        },
      });

      return c.redirect('/');
    }

    // Case 3: New Discord account, no existing session - create new user
    const newUser = await prisma.user.create({
      data: {
        discordAccount: {
          create: {
            discordId: userData.id,
            username: userData.username,
          },
        },
      },
    });

    // Generate JWT token and set in cookie
    const token = generateToken(newUser.id);
    setCookie(c, 'auth_token', token, getSecureCookieOptions());

    return c.redirect('/');
  } catch (error) {
    logError(callbackLog, 'Discord OAuth error', error);
    return c.text('Authentication failed', 500);
  }
});

// GitHub OAuth endpoints
authRoutes.get('/auth/github', async (c) => {
  // Generate and store state for CSRF protection
  const state = nanoid();
  setCookie(c, 'github_oauth_state', state, {
    ...getSecureCookieOptions(60 * 10), // 10 minutes
  });

  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: `${REDIRECT_URI_BASE}/auth/github/callback`,
    state,
    scope: 'read:user',
  });

  return c.redirect(
    `${GITHUB_API_URL}/login/oauth/authorize?${params.toString()}`,
  );
});

authRoutes.get('/auth/github/callback', async (c) => {
  const { code, state } = c.req.query();
  const storedState = getCookie(c, 'github_oauth_state');
  const authToken = getCookie(c, 'auth_token');
  let userId: null | string = null;

  // Check if user is already authenticated
  if (authToken) {
    const payload = verifyToken(authToken);
    if (payload) {
      userId = payload.userId;
    }
  }

  const callbackLog = log.child({
    state,
    hasStoredState: !!storedState,
    hasExistingUserId: !!userId,
  });

  // Validate state to prevent CSRF attacks
  if (!state || !storedState || state !== storedState) {
    callbackLog.warn('Invalid state parameter in GitHub callback');
    return c.text('Invalid state parameter', 400);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      `${GITHUB_API_URL}/login/oauth/access_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: config.github.clientId,
          client_secret: config.github.clientSecret,
          code,
          redirect_uri: `${REDIRECT_URI_BASE}/auth/github/callback`,
          state,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      logError(callbackLog, 'GitHub token error:', new Error(errorData));
      return c.text('Failed to exchange code for token', 500);
    }

    const tokenData = await tokenResponse.json();

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
        'User-Agent': 'discord-github-roles',
        Accept: `application/vnd.github.${GITHUB_API_VERSION}+json`,
      },
    });

    if (!userResponse.ok) {
      logError(
        callbackLog,
        'Failed to get user info from GitHub',
        new Error('API Error'),
        {
          status: userResponse.status,
        },
      );
      return c.text('Failed to get user info', 500);
    }

    const userData = await userResponse.json();
    const userLog = callbackLog.child({
      githubId: userData.id,
      githubUsername: userData.login,
    });
    userLog.info('Retrieved GitHub user data');

    // Check if GitHub account already exists
    const existingGithubAccount = await prisma.gitHubAccount.findUnique({
      where: { githubId: String(userData.id) },
      include: { user: true },
    });

    // Case 1: GitHub account exists - login to that account
    if (existingGithubAccount) {
      userLog.info(
        { existingUserId: existingGithubAccount.userId },
        'Found existing GitHub account',
      );
      // Update the GitHub account with fresh username if needed
      await prisma.gitHubAccount.update({
        where: { id: existingGithubAccount.id },
        data: {
          username: userData.login,
          updatedAt: new Date(),
        },
      });

      // Generate JWT token and set in cookie
      const token = generateToken(existingGithubAccount.userId);
      setCookie(c, 'auth_token', token, getSecureCookieOptions());

      userLog.info('Successfully logged in with existing GitHub account');
      return c.redirect('/');
    }

    // Case 2: User already logged in (has userId) - link GitHub to existing account
    if (userId) {
      // Check if the user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        // Clear invalid session
        setCookie(c, 'auth_token', '', {
          ...getSecureCookieOptions(0),
        });

        return c.text('Invalid user session. Please try again.', 400);
      }

      // Create new GitHub account linked to existing user
      await prisma.gitHubAccount.create({
        data: {
          githubId: String(userData.id),
          username: userData.login,
          user: { connect: { id: userId } },
        },
      });

      return c.redirect('/');
    }

    // Case 3: New GitHub account, no existing session - create new user
    const newUser = await prisma.user.create({
      data: {
        gitHubAccount: {
          create: {
            githubId: String(userData.id),
            username: userData.login,
          },
        },
      },
    });

    // Generate JWT token and set in cookie
    const token = generateToken(newUser.id);
    setCookie(c, 'auth_token', token, getSecureCookieOptions());

    return c.redirect('/');
  } catch (error) {
    logError(callbackLog, 'GitHub OAuth error', error);
    return c.text('Authentication failed', 500);
  }
});

// Endpoint to unlink all accounts (sign out)
authRoutes.post('/auth/unlink', async (c) => {
  const authToken = getCookie(c, 'auth_token');
  if (!authToken) {
    return c.text('Not authenticated', 401);
  }

  const payload = verifyToken(authToken);
  if (!payload) {
    return c.text('Invalid authentication token', 401);
  }

  const userId = payload.userId;

  try {
    // Delete the entire user record - cascading delete will remove associated accounts
    await prisma.user.delete({
      where: { id: userId },
    });

    // Clear session
    setCookie(c, 'auth_token', '', {
      ...getSecureCookieOptions(0),
    });

    return c.redirect('/');
  } catch (error) {
    logError(log, 'Error unlinking accounts', error);
    return c.text('Failed to unlink accounts', 500);
  }
});

// Simple logout without deleting accounts
authRoutes.get('/auth/logout', async (c) => {
  // Clear session cookie
  setCookie(c, 'auth_token', '', {
    ...getSecureCookieOptions(0),
  });

  return c.redirect('/');
});

// Endpoint to check current auth status
authRoutes.get('/auth/status', async (c) => {
  const authToken = getCookie(c, 'auth_token');
  if (!authToken) {
    return c.json({ authenticated: false });
  }

  const payload = verifyToken(authToken);
  if (!payload) {
    // Clear invalid token
    setCookie(c, 'auth_token', '', {
      ...getSecureCookieOptions(0),
    });
    return c.json({ authenticated: false });
  }

  const userId = payload.userId;

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

    if (!user) {
      // Clear invalid session
      setCookie(c, 'auth_token', '', {
        ...getSecureCookieOptions(0),
      });

      return c.json({ authenticated: false });
    }

    return c.json({
      authenticated: true,
      discord: user.discordAccount
        ? {
            username: user.discordAccount.username,
            id: user.discordAccount.discordId,
          }
        : null,
      github: user.gitHubAccount
        ? {
            username: user.gitHubAccount.username,
            id: user.gitHubAccount.githubId,
          }
        : null,
    });
  } catch (error) {
    logError(log, 'Error checking auth status', error);
    return c.json(
      { authenticated: false, error: 'Failed to check auth status' },
      500,
    );
  }
});
