# Cost Analysis: Cognito JWT Authentication with Lambda Authorizer

This document analyzes the cost implications of using Cognito JWT authentication with a Lambda authorizer for API Gateway.

## Cost Components

### 1. Amazon Cognito User Pool

**Pricing Model:** Monthly Active Users (MAUs)
- An MAU is a user who performs at least one identity operation (sign-in, token refresh) in a month
- **Free Tier:** First 50,000 MAUs/month are **FREE**

**Beyond Free Tier:**
- 50,001 - 100,000 MAUs: **$0.0055 per MAU**
- 101,000 - 1,000,000 MAUs: **$0.0046 per MAU**
- 1,000,001 - 10,000,000 MAUs: **$0.00325 per MAU**
- Over 10,000,000 MAUs: **$0.0025 per MAU**

**Additional Costs:**
- SMS MFA: ~$0.00645 per SMS (if used)
- Email via SES: Free (up to 62,000 emails/month)

### 2. Lambda Authorizer

**Pricing:** AWS Lambda Free Tier + Pay-per-use
- **Free Tier:** 
  - 1 million requests/month
  - 400,000 GB-seconds compute time/month
- **Beyond Free Tier:**
  - **$0.20 per 1 million requests**
  - **$0.0000166667 per GB-second** (for duration × memory)

**For Our Authorizer:**
- Memory: 128 MB (minimal)
- Duration: ~50-100ms typical
- Cost per million authorizer calls: ~$0.20 + compute (~$0.001) ≈ **$0.21 per million**

**Note:** Authorizer is invoked on **every API request** (unless cached)

### 3. API Gateway (HTTP API)

**Pricing:** Pay per request
- **Free Tier:** 1 million requests/month (first 12 months)
- **Beyond Free Tier:**
  - First 300 million/month: **$1.00 per million requests**
  - Over 300 million/month: **$0.90 per million requests**

### 4. DynamoDB (Game Data)

**Pricing:** Based on read/write capacity units
- **Free Tier:** 
  - 25 GB storage
  - 25 provisioned write capacity units
  - 25 provisioned read capacity units
- **On-Demand Mode:** 
  - **$1.25 per million write units**
  - **$0.25 per million read units**
  - Storage: $0.25 per GB-month

## Cost Scenarios

### Small Application (Startup/Testing)
- **10,000 MAUs/month** (within free tier)
- **1 million API calls/month** (within free tier)
- **Authorizer invocations:** 1 million (within Lambda free tier)
- **DynamoDB:** On-demand, minimal usage

**Total Monthly Cost: $0** ✅

### Medium Application
- **100,000 MAUs/month**
  - 50,000 free
  - 50,000 × $0.0055 = **$275**
- **10 million API calls/month**
  - 1 million free (if in first year)
  - 9 million × $1.00/million = **$9**
- **10 million authorizer invocations**
  - 1 million free
  - 9 million × $0.20/million = **$1.80**
  - Compute: negligible
- **DynamoDB:** ~$5-10/month (depends on usage)

**Total Monthly Cost: ~$290-295**

### Large Application
- **500,000 MAUs/month**
  - 50,000 free
  - 50,000 × $0.0055 = $275
  - 400,000 × $0.0046 = $1,840
  - Total: **$2,115**
- **50 million API calls/month**
  - 1 million free
  - 49 million × $1.00/million = **$49**
- **50 million authorizer invocations**
  - 1 million free
  - 49 million × $0.20/million = **$9.80**
- **DynamoDB:** ~$50-100/month

**Total Monthly Cost: ~$2,223-2,273**

## Cost Optimization Strategies

### 1. **Enable Authorizer Caching** (Not Currently Implemented)

**Impact:** Reduces Lambda invocations by caching authorizer results

**Configuration:**
```hcl
resource "aws_apigatewayv2_authorizer" "api_authorizer" {
  # ... existing config ...
  authorizer_result_ttl_in_seconds = 300  # Cache for 5 minutes
}
```

**Cost Savings:**
- If 80% of requests come from the same users within 5 minutes
- Reduces Lambda costs by ~80%
- Example: 10M requests → ~2M authorizer invocations (saves ~$1.60/month)

**Trade-off:** 
- Slightly higher latency on cache miss
- User changes (role updates) may not reflect immediately

### 2. **Use Built-in Cognito Authorizer** (Alternative)

**Current Setup:** Lambda authorizer (custom)
**Alternative:** API Gateway native Cognito authorizer

**Cost Difference:**
- Native Cognito authorizer: **No Lambda costs**
- Lambda authorizer: $0.20 per million requests

**When to Use Native:**
- Simple token validation (no custom logic)
- Lower cost
- Less flexibility

**When to Use Lambda:**
- Custom validation logic
- Need to pass custom context to handlers
- More control over authorization

**Our Current Choice:** Lambda authorizer (allows passing user context to handlers)

### 3. **Token Refresh Strategy**

**Optimization:** Implement token refresh on client
- Long-lived refresh tokens (30 days as configured)
- Short-lived ID tokens (24 hours)
- Reduces Cognito authentication calls

**Impact:** 
- Reduces MAU counting (fewer sign-ins)
- Reduces authorizer invocations slightly (tokens expire less often)

### 4. **API Request Optimization**

**Strategies:**
- Implement request batching where possible
- Use WebSocket for real-time features (cheaper for high-frequency)
- Cache static data on client side

### 5. **DynamoDB Optimization**

**Current:** On-demand pricing (auto-scaling)
**Consider:** Provisioned capacity if usage is predictable

**Cost Impact:**
- On-demand: Better for variable traffic
- Provisioned: Can be cheaper for steady, predictable traffic

## Cost Comparison: Cognito vs API Keys

### API Keys (Simple)
- **Cost:** $0 (stored in Lambda env var)
- **Limitations:**
  - No user identity
  - Hard to rotate per user
  - Security risk if exposed
  - Not suitable for user-centric apps

### Cognito JWT (Current)
- **Cost:** ~$0.0055 per MAU + Lambda authorizer costs
- **Benefits:**
  - User identity per request
  - Per-user revocation
  - Industry standard (JWT)
  - Scales to millions of users

## Recommendations

### For Your Game Project:

1. **Early Stage (< 10K users):**
   - Current setup is essentially **FREE** (within free tiers)
   - No optimization needed

2. **Growth Stage (10K-50K users):**
   - Still mostly free
   - Consider enabling authorizer caching if traffic grows

3. **Scale Stage (50K+ users):**
   - **Enable authorizer caching** (5-10 minute TTL)
   - Monitor DynamoDB costs
   - Consider moving high-frequency endpoints to WebSocket if applicable

4. **Enterprise (> 500K users):**
   - Evaluate native Cognito authorizer vs Lambda
   - Implement request batching
   - Consider dedicated infrastructure for game state

## Monitoring Costs

### AWS Cost Explorer
- Set up budgets and alerts
- Monitor by service (Cognito, Lambda, API Gateway, DynamoDB)

### Key Metrics to Track:
- Cognito MAUs
- API Gateway requests
- Lambda authorizer invocations
- DynamoDB read/write units

## Summary

**Current Setup Cost:**
- **Small scale:** FREE (within free tiers)
- **Medium scale:** ~$290/month for 100K users, 10M requests
- **Large scale:** ~$2,200/month for 500K users, 50M requests

**Cost per User (at scale):**
- ~$0.004 per user at 100K MAUs
- ~$0.004 per user at 500K MAUs (volume discount)

**Recommendation:** Your current setup is cost-effective for a game project. Cognito + Lambda authorizer provides excellent security and user management at reasonable costs, especially with the generous free tiers.

