#!/bin/sh

set -e

# Initialize the database if it doesn't exist
if [ ! -f "/app/prisma/data.db" ]; then
  echo "Initializing SQLite database..."
  npx prisma migrate deploy
  touch /app/prisma/data.db
  chmod 664 /app/prisma/data.db
fi

# Start the application
echo "Starting application..."
node dist/index.js
