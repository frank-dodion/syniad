# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
# Build context is project root
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Copy package files (needed for npm run build)
COPY package.json package-lock.json* ./
# Copy app files
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY shared ./shared
COPY docs ./docs
COPY next.config.js ./
COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
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
# Copy the adapter from the official public ECR image - using latest version
RUN mkdir -p /opt/extensions
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.6.0 /lambda-adapter /opt/extensions/lambda-adapter
RUN chmod +x /opt/extensions/lambda-adapter

# Lambda requires files in /var/task
# Lambda Function URLs require Lambda Web Adapter (installed above) to translate
# between Lambda Runtime API invocations and HTTP requests to our Next.js server
# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
WORKDIR /var/task
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/docs ./docs

# Ensure Lambda's default user can read files (Lambda runs as different user)
# Files are owned by nextjs but readable by all
RUN chmod -R 755 /var/task

# Lambda Web Adapter environment variables
# The adapter translates Lambda Runtime API invocations to HTTP requests
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
# Lambda Web Adapter configuration - disable readiness check to avoid timeout
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_ENABLE_READINESS_CHECK=false

# Run as nextjs user for security (files are readable by Lambda's user via chmod)
USER nextjs

# Lambda Web Adapter runs as an extension (from /opt/extensions/)
# The adapter automatically detects and starts the server on PORT 8080
# No need for explicit entrypoint - Lambda will use the extension
CMD ["node", "server.js"]
