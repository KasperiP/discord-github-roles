# Use Alpine-based Node.js image
FROM node:23-alpine AS base

# Set working directory
WORKDIR /app

# Install OpenSSL and other dependencies for Prisma in Alpine
RUN apk add --no-cache openssl ca-certificates

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy Prisma schema first to optimize build caching
COPY prisma ./prisma

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client with explicit binary target
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy all source files
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM node:23-alpine AS production

WORKDIR /app

# Install OpenSSL and other dependencies for Prisma in Alpine
RUN apk add --no-cache openssl ca-certificates

# Install pnpm globally in production image
RUN npm install -g pnpm

# Copy built app from base stage
COPY --from=base /app/package.json /app/pnpm-lock.yaml ./
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/public ./public

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE 3000

# Add startup script to handle database initialization
COPY --from=base /app/scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

# Start the application
CMD ["./start.sh"]
