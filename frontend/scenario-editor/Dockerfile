# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

# Accept build args for Next.js public environment variables
# These are embedded at build time, not runtime
ARG NEXT_PUBLIC_FRONTEND_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_FRONTEND_URL=${NEXT_PUBLIC_FRONTEND_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install Lambda Web Adapter for Function URL support
# Lambda Function URLs use the Lambda Runtime API, which requires the adapter to translate to HTTP
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        ADAPTER_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        ADAPTER_ARCH="arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -L "https://github.com/awslabs/aws-lambda-web-adapter/releases/latest/download/aws-lambda-web-adapter-${ADAPTER_ARCH}" -o /usr/local/bin/aws-lambda-web-adapter && \
    chmod +x /usr/local/bin/aws-lambda-web-adapter

# Lambda requires files in /var/task
# Lambda Function URLs require Lambda Web Adapter (installed above) to translate
# between Lambda Runtime API invocations and HTTP requests to our Next.js server
# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
WORKDIR /var/task
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Ensure Lambda's default user can read files (Lambda runs as different user)
# Files are owned by nextjs but readable by all
RUN chmod -R 755 /var/task

# Lambda Web Adapter environment variables
# The adapter translates Lambda Runtime API invocations to HTTP requests
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Run as nextjs user for security (files are readable by Lambda's user via chmod)
USER nextjs

# Use Lambda Web Adapter as entrypoint, which will start the Next.js server
# The adapter listens on the Lambda Runtime API and proxies to our server on PORT 8080
ENTRYPOINT ["/usr/local/bin/aws-lambda-web-adapter"]
CMD ["node", "server.js"]
