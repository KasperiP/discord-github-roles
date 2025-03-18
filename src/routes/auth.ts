import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { nanoid } from 'nanoid';
import { prisma } from '../index';
import { config } from '../config/config';

export const authRoutes = new Hono();

// Constants for OAuth
const DISCORD_API_URL = 'https://discord.com/api/v10';
const GITHUB_API_URL = 'https://github.com';
const GITHUB_API_VERSION = 'v3';
const REDIRECT_URI_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://your-production-domain.com'
    : 'http://localhost:3000';

// Discord OAuth endpoints
authRoutes.get('/auth/discord', async (c) => {
  // Generate and store state for CSRF protection
  const state = nanoid();
  setCookie(c, 'discord_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  });

  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: `${REDIRECT_URI_BASE}/auth/discord/callback`,
    response_type: 'code',
    state,
    scope: 'identify',
  });

  return c.redirect(`${DISCORD_API_URL}/oauth2/authorize?${params.toString()}`);
});

authRoutes.get('/auth/discord/callback', async (c) => {
  const { code, state } = c.req.query();
  const storedState = getCookie(c, 'discord_oauth_state');

  // Validate state to prevent CSRF attacks
  if (!state || !storedState || state !== storedState) {
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
      console.error('Discord token error:', errorData);
      return c.text('Failed to exchange code for token', 500);
    }

    const tokenData = await tokenResponse.json();

    // Get user info from Discord
    const userResponse = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      return c.text('Failed to get user info', 500);
    }

    const userData = await userResponse.json();

    // Check if Discord account already exists
    const existingAccount = await prisma.discordAccount.findUnique({
      where: { discordId: userData.id },
      include: { user: true },
    });
    let userId: string;

    if (existingAccount) {
      // Update existing Discord account
      const updatedAccount = await prisma.discordAccount.update({
        where: { id: existingAccount.id },
        data: {
          username: userData.username,
          discriminator: userData.discriminator ?? null,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? null,
          tokenExpires: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : null,
          updatedAt: new Date(),
        },
        include: { user: true },
      });

      userId = updatedAccount.userId;
    } else {
      // Create new user and Discord account
      const newUser = await prisma.user.create({
        data: {
          discordAccount: {
            create: {
              discordId: userData.id,
              username: userData.username,
              discriminator: userData.discriminator ?? null,
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token ?? null,
              tokenExpires: tokenData.expires_in
                ? new Date(Date.now() + tokenData.expires_in * 1000)
                : null,
            },
          },
        },
        include: {
          discordAccount: true,
        },
      });

      if (!newUser.discordAccount) {
        return c.text('Failed to create Discord account', 500);
      }

      userId = newUser.id;
    }

    // Store user ID in cookie
    setCookie(c, 'user_id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    return c.redirect('/');
  } catch (error) {
    console.error('Discord OAuth error:', error);
    return c.text('Authentication failed', 500);
  }
});

// GitHub OAuth endpoints
authRoutes.get('/auth/github', async (c) => {
  // Generate and store state for CSRF protection
  const state = nanoid();
  setCookie(c, 'github_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
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
  const userId = getCookie(c, 'user_id');

  // Validate state to prevent CSRF attacks
  if (!state || !storedState || state !== storedState) {
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
      console.error('GitHub token error:', errorData);
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
      return c.text('Failed to get user info', 500);
    }

    const userData = await userResponse.json();

    // Check if GitHub account already exists
    let githubAccount = await prisma.gitHubAccount.findUnique({
      where: { githubId: String(userData.id) },
      include: { user: true },
    });

    if (githubAccount) {
      // If the GitHub account is already linked to a different user
      if (userId && githubAccount.userId !== userId) {
        return c.text(
          'This GitHub account is already linked to another Discord account',
          400,
        );
      }

      // Update existing GitHub account
      githubAccount = await prisma.gitHubAccount.update({
        where: { id: githubAccount.id },
        data: {
          username: userData.login,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? null,
          tokenExpires: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : null,
          updatedAt: new Date(),
        },
        include: { user: true },
      });
    } else {
      // If user is not logged in with Discord yet
      if (!userId) {
        // Store GitHub credentials temporarily and redirect to Discord login
        setCookie(
          c,
          'github_temp_data',
          JSON.stringify({
            githubId: String(userData.id),
            username: userData.login,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token ?? null,
            tokenExpires: tokenData.expires_in
              ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
              : null,
          }),
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 10, // 10 minutes
          },
        );

        return c.redirect('/auth/discord');
      }

      // Link GitHub account to existing user
      await prisma.gitHubAccount.create({
        data: {
          githubId: String(userData.id),
          username: userData.login,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? null,
          tokenExpires: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : null,
          user: {
            connect: { id: userId },
          },
        },
      });
    }

    return c.redirect('/');
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return c.text('Authentication failed', 500);
  }
});

// Endpoint to unlink GitHub account
authRoutes.post('/auth/github/unlink', async (c) => {
  const userId = getCookie(c, 'user_id');

  if (!userId) {
    return c.text('Not authenticated', 401);
  }

  try {
    await prisma.gitHubAccount.deleteMany({
      where: { userId },
    });

    return c.text('GitHub account unlinked successfully');
  } catch (error) {
    console.error('Error unlinking GitHub account:', error);
    return c.text('Failed to unlink GitHub account', 500);
  }
});

// Endpoint to unlink Discord account
authRoutes.post('/auth/discord/unlink', async (c) => {
  const userId = getCookie(c, 'user_id');

  if (!userId) {
    return c.text('Not authenticated', 401);
  }

  try {
    await prisma.discordAccount.deleteMany({
      where: { userId },
    });

    // Clear session
    setCookie(c, 'user_id', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });

    return c.text('Discord account unlinked successfully');
  } catch (error) {
    console.error('Error unlinking Discord account:', error);
    return c.text('Failed to unlink Discord account', 500);
  }
});

// Endpoint to check current auth status
authRoutes.get('/auth/status', async (c) => {
  const userId = getCookie(c, 'user_id');

  if (!userId) {
    return c.json({ authenticated: false });
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

    if (!user) {
      // Clear invalid session
      setCookie(c, 'user_id', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
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
    console.error('Error checking auth status:', error);
    return c.json(
      { authenticated: false, error: 'Failed to check auth status' },
      500,
    );
  }
});
