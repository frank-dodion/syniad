# AWS Cost Estimate for Syniad Application

## Infrastructure Overview

The application uses the following AWS services:
- **Lambda** (Next.js containerized app)
- **DynamoDB** (3 tables: games, player_games, scenarios)
- **CloudFront** (CDN for static assets and Lambda)
- **S3** (Static asset storage)
- **ECR** (Container image registry)
- **Cognito** (User authentication)
- **Route53** (DNS - if domain hosted on AWS)
- **ACM** (SSL certificates - free)
- **CloudWatch** (Logs - included with Lambda)

## Monthly Cost Breakdown

### Assumptions
- **Monthly Active Users (MAU)**: 100 users
- **Requests per user per month**: 1,000 requests
- **Total monthly requests**: 100,000 requests
- **Data transfer**: 10 GB/month
- **Storage**: 1 GB for static assets, minimal DynamoDB storage

### 1. AWS Lambda
**Configuration:**
- Memory: 1,024 MB
- Timeout: 60 seconds
- Architecture: Container image

**Pricing (us-east-1):**
- Compute: $0.0000166667 per GB-second
- Requests: $0.20 per 1M requests

**Monthly Cost:**
- Compute: 100,000 requests × 0.5s avg duration × 1 GB = 50,000 GB-seconds
  - Cost: 50,000 × $0.0000166667 = **$0.83**
- Requests: 100,000 requests = 0.1M requests
  - Cost: 0.1 × $0.20 = **$0.02**
- **Subtotal: $0.85/month**

### 2. DynamoDB (On-Demand Billing)
**Configuration:**
- 3 tables: games, player_games, scenarios
- Billing mode: PAY_PER_REQUEST

**Pricing:**
- Write requests: $1.25 per million
- Read requests: $0.25 per million
- Storage: $0.25 per GB-month

**Monthly Cost (estimated):**
- Write requests: 10,000 writes/month = 0.01M
  - Cost: 0.01 × $1.25 = **$0.01**
- Read requests: 50,000 reads/month = 0.05M
  - Cost: 0.05 × $0.25 = **$0.01**
- Storage: ~0.1 GB (very minimal)
  - Cost: 0.1 × $0.25 = **$0.03**
- **Subtotal: $0.05/month**

### 3. CloudFront
**Configuration:**
- Distribution with Lambda and S3 origins
- Static assets cached for 1 year

**Pricing:**
- Data transfer out: $0.085 per GB (first 10 TB)
- HTTPS requests: $0.0100 per 10,000 requests
- Invalidation requests: $0.005 per request (first 1,000 free)

**Monthly Cost:**
- Data transfer: 10 GB
  - Cost: 10 × $0.085 = **$0.85**
- HTTPS requests: 100,000 requests = 10 × 10,000
  - Cost: 10 × $0.0100 = **$0.10**
- Invalidations: ~10/month (free tier covers this)
  - Cost: **$0.00**
- **Subtotal: $0.95/month**

### 4. S3 (Static Assets)
**Configuration:**
- Standard storage
- Versioning enabled
- CloudFront OAC access only

**Pricing:**
- Storage: $0.023 per GB-month
- PUT requests: $0.005 per 1,000 requests
- GET requests: $0.0004 per 1,000 requests

**Monthly Cost:**
- Storage: 1 GB
  - Cost: 1 × $0.023 = **$0.02**
- PUT requests: ~10/month (deployments)
  - Cost: 0.01 × $0.005 = **$0.00**
- GET requests: 50,000/month (via CloudFront)
  - Cost: 50 × $0.0004 = **$0.02**
- **Subtotal: $0.04/month**

### 5. ECR (Container Registry)
**Configuration:**
- Image scanning enabled
- Lifecycle policy: keep last 10 images

**Pricing:**
- Storage: $0.10 per GB-month
- Data transfer: Free (within same region)

**Monthly Cost:**
- Storage: ~2 GB (container images)
  - Cost: 2 × $0.10 = **$0.20**
- **Subtotal: $0.20/month**

### 6. Cognito
**Configuration:**
- User Pool with hosted UI domain
- OAuth flows enabled

**Pricing:**
- Monthly Active Users (MAU): First 50,000 free, then $0.0055 per MAU
- SMS MFA: $0.00645 per SMS (if used)
- Advanced security features: Free tier covers basic features

**Monthly Cost:**
- MAU: 100 users (within free tier)
  - Cost: **$0.00**
- SMS MFA: Not used (email verification only)
  - Cost: **$0.00**
- **Subtotal: $0.00/month**

### 7. Route53 (DNS)
**Pricing:**
- Hosted zone: $0.50 per zone per month
- Queries: $0.40 per million queries (first 1 billion free)

**Monthly Cost:**
- Hosted zone: 1 zone
  - Cost: **$0.50**
- Queries: ~100,000/month (within free tier)
  - Cost: **$0.00**
- **Subtotal: $0.50/month**

### 8. CloudWatch Logs
**Pricing:**
- Ingestion: $0.50 per GB
- Storage: $0.03 per GB-month

**Monthly Cost:**
- Logs: ~0.5 GB/month
  - Ingestion: 0.5 × $0.50 = **$0.25**
  - Storage: 0.5 × $0.03 = **$0.02**
- **Subtotal: $0.27/month**

### 9. ACM (SSL Certificates)
**Pricing:**
- Free for public certificates

**Monthly Cost:**
- **Subtotal: $0.00/month**

## Total Monthly Cost Estimate

| Service | Monthly Cost |
|---------|--------------|
| Lambda | $0.85 |
| DynamoDB | $0.05 |
| CloudFront | $0.95 |
| S3 | $0.04 |
| ECR | $0.20 |
| Cognito | $0.00 |
| Route53 | $0.50 |
| CloudWatch | $0.27 |
| ACM | $0.00 |
| **Total** | **$2.86/month** |

## Annual Cost Estimate
**$34.32/year** (at 100 MAU)

## Cost Scaling Estimates

### Low Usage (10 MAU, 10K requests/month)
- **Monthly: ~$1.50**
- **Annual: ~$18**

### Medium Usage (100 MAU, 100K requests/month) - Current Estimate
- **Monthly: ~$2.86**
- **Annual: ~$34**

### High Usage (1,000 MAU, 1M requests/month)
- **Monthly: ~$15-20**
- **Annual: ~$180-240**

### Very High Usage (10,000 MAU, 10M requests/month)
- **Monthly: ~$100-150**
- **Annual: ~$1,200-1,800**

## Cost Optimization Notes

1. **Lambda**: Current 1GB memory may be over-provisioned. Consider testing with 512MB or 768MB to reduce costs by ~50%.

2. **CloudFront**: Most costs come from data transfer. Consider:
   - Enabling compression (already enabled)
   - Optimizing static asset sizes
   - Using CloudFront caching more aggressively

3. **DynamoDB**: On-demand pricing is cost-effective for low/medium traffic. Consider provisioned capacity only if traffic is very predictable and high.

4. **ECR**: Lifecycle policy keeps only last 10 images, which is good. Consider reducing to 5 if storage costs become significant.

5. **CloudWatch**: Consider setting log retention to 7 days instead of default (never expire) to reduce storage costs.

## Free Tier Eligibility

- **Lambda**: 1M free requests/month, 400,000 GB-seconds free compute
- **DynamoDB**: 25 GB free storage, 25 read/write capacity units
- **CloudFront**: 1 TB data transfer out, 10M HTTPS requests
- **S3**: 5 GB storage, 20,000 GET requests, 2,000 PUT requests
- **ECR**: 500 MB storage
- **Cognito**: 50,000 MAU free
- **Route53**: 1 hosted zone, 1 billion queries

**Note**: At 100 MAU, most services are well within free tier limits, making the actual cost potentially even lower.

## Actual Cost Monitoring

To monitor actual costs:
1. Enable AWS Cost Explorer
2. Set up billing alerts in AWS Budgets
3. Review monthly AWS Cost and Usage Report
4. Use AWS Cost Anomaly Detection for unexpected charges

## Disclaimer

These estimates are based on typical usage patterns and AWS pricing as of 2024. Actual costs may vary based on:
- Actual usage patterns
- Regional pricing differences
- Data transfer volumes
- Storage growth over time
- AWS pricing changes

For the most accurate estimate, use the [AWS Pricing Calculator](https://calculator.aws/) with your specific usage patterns.

