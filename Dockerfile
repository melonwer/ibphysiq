# Use multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

# Create app directory and non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code with proper ownership
COPY --chown=nextjs:nodejs . .

# Dependencies stage
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat dumb-init
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --frozen-lockfile

# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment to production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS runner
LABEL maintainer="melonwer"
LABEL description="IB Physics Practice Question Generator - AI-powered educational tool"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="IB PhysIQ"
LABEL org.opencontainers.image.description="An AI-powered web application for generating IB Physics practice questions"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="melonwer"
LABEL org.opencontainers.image.url="https://github.com/melonwer/ibphysiq"
LABEL org.opencontainers.image.source="https://github.com/melonwer/ibphysiq"
LABEL org.opencontainers.image.vendor="melonwer"
LABEL org.opencontainers.image.licenses="MIT"

# Install dumb-init and security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set working directory
WORKDIR /app

# Copy built application with proper ownership
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for JSONL persistence
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Create health check script
RUN echo '#!/bin/sh\ncurl -f http://localhost:3000/api/generate-question?action=health || exit 1' > /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh && \
    chown nextjs:nodejs /app/healthcheck.sh

# Install curl for health checks
RUN apk add --no-cache curl

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD /app/healthcheck.sh

# Use dumb-init for signal handling and start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]