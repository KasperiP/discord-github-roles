import pino from 'pino';

// Configure logger options
const loggerOptions = {
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
  base: undefined, // Don't include pid and hostname
};

// Create and export the logger instance
export const logger = pino(loggerOptions);

// Create child loggers for different components
export const createChildLogger = (
  component: string,
  metadata: Record<string, unknown> = {},
) => {
  return logger.child({ component, ...metadata });
};

// Helper function for logging with error objects
export function logError(
  log: pino.Logger,
  message: string,
  error: unknown,
  additionalContext: Record<string, unknown> = {},
) {
  // Extract relevant info from error objects to make them serializable
  const errorInfo =
    error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : String(error);

  log.error({ ...additionalContext, error: errorInfo }, message);
}
