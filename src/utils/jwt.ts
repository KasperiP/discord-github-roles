import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { createChildLogger } from './logger';

const log = createChildLogger('jwt');

// Secret key for JWT signing and verification
// Should be stored in environment variables
const JWT_SECRET = config.jwt?.secret || 'CHANGE_ME_TO_A_SECURE_SECRET';

if (!config.jwt?.secret) {
  log.warn(
    'JWT secret not configured. Using default secret - NOT SECURE FOR PRODUCTION',
  );
}

// JWT expiration time
const JWT_EXPIRES_IN = '7d'; // 7 days

interface TokenPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * Returns the payload if valid, null if invalid
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return payload;
  } catch (error) {
    log.debug({ error: (error as Error).message }, 'Invalid JWT token');
    return null;
  }
}
