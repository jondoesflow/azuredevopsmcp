# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling and curl for health checks
RUN apk add --no-cache dumb-init curl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose HTTP port
EXPOSE 8080

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Environment variables (can be overridden at runtime)
ENV PORT=8080
ENV TRANSPORT_MODE=http

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run as non-root for least privilege runtime.
USER node

# Start the MCP server
CMD ["node", "dist/index.js"]
