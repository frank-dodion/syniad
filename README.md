# Syniad - Real-time Turn-based Wargame

A serverless real-time turn-based wargame built with TypeScript, Terraform, and AWS.

## Architecture

- **Frontend**: Web browser (HTML/JavaScript)
- **Backend**: AWS Lambda functions (TypeScript)
- **API**: AWS API Gateway (HTTP)
- **Database**: AWS DynamoDB
- **Infrastructure**: Terraform

## Prerequisites

- Node.js 20+
- AWS CLI configured (`aws configure`)
- Terraform 1.0+
- AWS account with appropriate permissions

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Terraform variables:**
   ```bash
   cp terraform/terraform.tfvars.example terraform/terraform.tfvars
   # Edit terraform.tfvars if needed
   ```

3. **Initialize Terraform:**
   ```bash
   npm run terraform:init
   ```

## Development

### Type Checking
```bash
npm run typecheck
```

### Build
```bash
npm run build
npm run build:lambda  # Build Lambda packages
```

### Deploy Infrastructure
```bash
# Plan changes (review what will be created)
npm run terraform:plan

# Apply changes (deploy to AWS)
npm run deploy

# Or deploy to specific stage
npm run deploy:dev
```

### View Outputs
```bash
npm run terraform:output
```

This will show you the API endpoint URL after deployment.

## Project Structure

```
syniad/
├── handlers/          # Lambda function handlers (TypeScript)
│   ├── test.ts
│   └── createGame.ts
├── lib/              # Shared library code (TypeScript)
│   └── db.ts
├── shared/           # Shared types (TypeScript)
│   └── types.ts
├── terraform/        # Infrastructure as Code
│   ├── main.tf
│   ├── lambda.tf
│   ├── api-gateway.tf
│   ├── dynamodb.tf
│   └── outputs.tf
├── scripts/          # Build and deployment scripts
│   └── build-lambda.sh
└── frontend/         # Frontend code (to be added)
```

## API Endpoints

After deployment, you'll get API endpoints:
- `GET /test` - Test endpoint
- `POST /games` - Create a new game

## Local Testing

### Quick Start

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Start local server:**
   ```bash
   npm run dev
   ```

3. **Test endpoints:**
   ```bash
   # Test endpoint
   curl http://localhost:3000/test
   
   # Create a game
   curl -X POST http://localhost:3000/games \
     -H "Content-Type: application/json" \
     -d '{"playerName": "TestPlayer"}'
   ```

### How It Works

The local server (`npm run dev`):
- Compiles TypeScript automatically
- Runs handlers in a local HTTP server
- Uses **in-memory mock DynamoDB** (data persists only while server runs)
- Simulates API Gateway events and responses

### Alternative Local Testing Options

For more advanced local testing:
- [LocalStack](https://localstack.cloud/) - Full AWS emulation
- [SAM Local](https://docs.aws.amazon.com/serverless-application-model/) - AWS SAM CLI
- Or test directly against deployed AWS endpoints

## Terraform Commands

```bash
# Initialize Terraform
cd terraform && terraform init

# Plan infrastructure changes
cd terraform && terraform plan

# Apply infrastructure
cd terraform && terraform apply

# Destroy infrastructure
cd terraform && terraform destroy
```

## Documentation

Additional documentation is available in the `docs/` directory:

- **[Authentication State](docs/AUTH-STATE.md)** - Current authentication implementation, known issues, and troubleshooting
- **[Cognito Allowlist](docs/COGNITO-ALLOWLIST.md)** - Managing email domain and email allowlist with Terraform
- **[API Documentation](docs/API-DOCS-DEPLOYMENT.md)** - API documentation deployment guide
- **[WebSocket Architecture](docs/WEBSOCKET-ARCHITECTURE.md)** - Real-time communication architecture
- See `docs/README.md` for a complete list of documentation files

## Next Steps

1. Add WebSocket support for real-time game updates
2. Add game definitions library
3. Implement hex grid rendering
4. Add unit movement logic
5. Add authentication (Cognito)

