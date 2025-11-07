# Multi-stage build for Next.js Lambda deployment
FROM public.ecr.aws/lambda/nodejs:20 AS builder

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# Production stage - use AWS Lambda base image
FROM public.ecr.aws/lambda/nodejs:20

# Install Lambda Web Adapter extension
# The Lambda Web Adapter is installed as an extension in /opt/extensions/
RUN curl -Lo /opt/extensions/lambda-adapter https://github.com/awslabs/aws-lambda-web-adapter/releases/latest/download/lambda-adapter && \
    chmod +x /opt/extensions/lambda-adapter

ENV PORT=8080
ENV AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap

# Copy built application from builder
COPY --from=builder /app/.next/standalone/ /var/task/
COPY --from=builder /app/.next/static /var/task/.next/static
COPY --from=builder /app/public /var/task/public

# Set working directory to where server.js is located
WORKDIR /var/task/frontend/game

# Lambda handler - the Lambda Web Adapter will handle HTTP requests
CMD ["node", "server.js"]

