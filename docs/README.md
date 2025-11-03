# API Documentation

This directory contains the OpenAPI specification and Swagger UI for the Syniad API.

## Files

- `openapi.yaml` - OpenAPI 3.0 specification for the API
- `swagger-ui.html` - Swagger UI interface for browsing and testing the API (local development)

## Accessing Documentation

### Online (Deployed API)

Once deployed, the documentation is automatically available at:
- **Swagger UI**: `https://your-api-url.com/docs`
- **OpenAPI Spec**: `https://your-api-url.com/docs/openapi.yaml`

The Swagger UI loads the OpenAPI spec automatically and uses the current API server. No authentication is required to view the docs (but API calls in Swagger UI will require auth tokens).

## Serving the Documentation

### Option 1: Using npm script (recommended)

```bash
npm run docs:serve
```

This will start a local server at `http://localhost:8080`.

### Option 2: Using the script directly

```bash
node scripts/serve-swagger.js [port]
```

The default port is 8080, but you can specify a different port:

```bash
node scripts/serve-swagger.js 3000
```

### Option 3: Using a static file server

If you have Python installed:

```bash
cd docs
python3 -m http.server 8080
```

Then open `http://localhost:8080/swagger-ui.html` in your browser.

### Option 4: Using VS Code Live Server

If you have the "Live Server" extension installed in VS Code:
1. Right-click on `swagger-ui.html`
2. Select "Open with Live Server"

## Using Swagger UI

### Setting Authentication Token

The API requires JWT Bearer token authentication. To set your token in Swagger UI:

1. Open the browser console (F12)
2. Run: `setAuthToken("your-jwt-token-here")`
3. The page will reload and all API requests will include the token

Alternatively, you can manually add the token in each request's "Authorize" button in Swagger UI.

### Getting Your JWT Token

Use the test authentication script:

```bash
./scripts/test-cognito-auth.sh
```

This will generate tokens and save them to `.env`. You can copy the `ID_TOKEN` value from there.

### Testing the API

1. Open Swagger UI (run `npm run docs:serve`)
2. Set your auth token using the console method above
3. Expand any endpoint
4. Click "Try it out"
5. Fill in parameters (if needed)
6. Click "Execute"
7. View the response

## Updating the OpenAPI Spec

The OpenAPI specification is located in `docs/openapi.yaml`. When you add new endpoints or modify existing ones:

1. Update the `paths` section with new endpoints
2. Update the `components/schemas` section with new data models
3. Update response schemas if needed
4. Restart the Swagger UI server to see changes

## API Server Configuration

The OpenAPI spec includes server URLs that can be configured. Update the `servers` section in `openapi.yaml` to match your deployment:

```yaml
servers:
  - url: https://api.syniad.com
    description: Production server
  - url: http://localhost:3000
    description: Local development server
```

You can also override the server URL in Swagger UI by clicking the server dropdown at the top of the page.

