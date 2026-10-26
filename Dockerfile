# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

# Install openssl for Prisma native engine support
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Install dependencies based on lockfile
COPY package*.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and documentation
COPY . .

# Expose server port
EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start the application
CMD ["node", "src/server.js"]
