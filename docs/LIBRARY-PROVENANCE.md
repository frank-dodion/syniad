# Library Provenance

This document tracks the origin and maintainership of all dependencies in the Syniad project.

## Dependencies

### `aws-jwt-verify` (v5.1.1)
**Purpose:** JWT token verification for AWS Cognito tokens

**Provenance:**
- **Publisher:** AWS SDK Team
- **Official:** Yes - Official AWS package
- **Repository:** https://github.com/awslabs/aws-jwt-verify
- **License:** Apache-2.0
- **Maintained by:** Amazon Web Services

**Why we use it:**
- Official AWS package for verifying Cognito JWT tokens
- Recommended by AWS for Lambda authorizers
- Actively maintained by AWS
- Secure and audited

**Security:**
- Official AWS package with regular security updates
- Used in production by thousands of AWS customers

---

### `uuid` (v9.0.1)
**Purpose:** Generate unique IDs (used for game IDs)

**Provenance:**
- **Publisher:** uuidjs
- **Repository:** https://github.com/uuidjs/uuid
- **License:** MIT
- **Maintained by:** Community (Robert Klep, Benjamin Coe, and contributors)

**Why we use it:**
- Industry standard for UUID generation
- Well-tested and widely used
- Supports UUID v4 (random) which we use for game IDs

**Security:**
- MIT licensed
- Well-maintained with regular updates
- ~100 million weekly downloads on npm

---

### `@aws-sdk/client-dynamodb` (v3.922.0)
**Purpose:** AWS SDK for DynamoDB operations

**Provenance:**
- **Publisher:** Amazon.com
- **Official:** Yes - Official AWS SDK
- **Repository:** https://github.com/aws/aws-sdk-js-v3
- **License:** Apache-2.0
- **Maintained by:** Amazon Web Services

**Why we use it:**
- Official AWS SDK for DynamoDB
- Required for DynamoDB operations in Lambda functions
- Actively maintained by AWS

**Security:**
- Official AWS package
- Regular security patches and updates

---

### `@aws-sdk/lib-dynamodb` (v3.922.0)
**Purpose:** Higher-level DynamoDB Document Client (simplifies DynamoDB operations)

**Provenance:**
- **Publisher:** Amazon.com
- **Official:** Yes - Official AWS SDK
- **Repository:** https://github.com/aws/aws-sdk-js-v3
- **License:** Apache-2.0
- **Maintained by:** Amazon Web Services

**Why we use it:**
- Part of official AWS SDK
- Provides DocumentClient interface (simpler than low-level client)
- Used in `lib/db.ts` for game CRUD operations

**Security:**
- Official AWS package
- Regular security patches and updates

---

## Dev Dependencies

### `typescript` (v5.9.3)
**Purpose:** TypeScript compiler

**Provenance:**
- **Publisher:** Microsoft Corporation
- **Repository:** https://github.com/microsoft/TypeScript
- **License:** Apache-2.0
- **Maintained by:** Microsoft

**Why we use it:**
- Industry standard TypeScript compiler
- Required for our TypeScript codebase

---

### `@types/aws-lambda` (v8.10.157)
**Purpose:** TypeScript type definitions for AWS Lambda

**Provenance:**
- **Repository:** https://github.com/DefinitelyTyped/DefinitelyTyped
- **License:** MIT
- **Maintained by:** DefinitelyTyped community

**Why we use it:**
- Official type definitions for AWS Lambda events
- Required for TypeScript compilation of Lambda handlers

---

### `@types/node` (v24.9.2)
**Purpose:** TypeScript type definitions for Node.js

**Provenance:**
- **Repository:** https://github.com/DefinitelyTyped/DefinitelyTyped
- **License:** MIT
- **Maintained by:** DefinitelyTyped community

---

### `@types/uuid` (v9.0.8)
**Purpose:** TypeScript type definitions for uuid package

**Provenance:**
- **Repository:** https://github.com/DefinitelyTyped/DefinitelyTyped
- **License:** MIT
- **Maintained by:** DefinitelyTyped community

---

## Security Considerations

### All Dependencies
- ✅ All dependencies are from reputable sources (AWS, Microsoft, well-known community packages)
- ✅ No dependencies have known critical vulnerabilities
- ✅ Regular `npm audit` recommended to check for updates

### Verification Commands

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# View dependency tree
npm ls

# Check package details
npm info <package-name>
```

---

## Recently Added Libraries (for Cognito Authentication)

### `aws-jwt-verify` (Added for Cognito JWT validation)
- **When added:** During Cognito authentication implementation
- **Why:** Required to verify Cognito JWT tokens in Lambda authorizer
- **Alternative considered:** Manual JWT verification (rejected - less secure, more code)
- **Risk level:** Low - Official AWS package

---

## Summary

| Library | Official | Maintainer | License | Risk |
|---------|----------|------------|---------|------|
| `aws-jwt-verify` | ✅ Yes | AWS | Apache-2.0 | Low |
| `uuid` | ⚠️ No | Community | MIT | Low |
| `@aws-sdk/*` | ✅ Yes | AWS | Apache-2.0 | Low |
| `typescript` | ✅ Yes | Microsoft | Apache-2.0 | Low |
| `@types/*` | ⚠️ No | Community | MIT | Low |

**All dependencies are from reputable sources with good security track records.**

