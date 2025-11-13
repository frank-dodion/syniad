# Cognito Email Allowlist Management

## Overview

The application uses a Cognito PreSignUp Lambda trigger to restrict user signups to allowed email domains and specific email addresses. This prevents unauthorized users from creating accounts.

## How It Works

When a user attempts to sign up:
1. Cognito invokes the PreSignUp Lambda function
2. The Lambda checks if the email:
   - Ends with any domain in `cognito_allowed_domains` (e.g., `@dodion.co.uk`)
   - OR exactly matches any email in `cognito_allowed_emails`
3. If either condition is met, signup is allowed
4. If neither condition is met, signup is blocked with error: "Signup is restricted to invited users. Please contact an administrator."

## Terraform Configuration

### Variables

The allowlist is managed through two Terraform variables:

- **`cognito_allowed_domains`**: List of allowed email domains (default: `["@dodion.co.uk"]`)
- **`cognito_allowed_emails`**: List of specific allowed email addresses (default: `[]`)

### Default Configuration

In `terraform/variables.tf`:

```hcl
variable "cognito_allowed_domains" {
  description = "List of allowed email domains for signup (e.g., ['@dodion.co.uk'])"
  type        = list(string)
  default     = ["@dodion.co.uk"]
}

variable "cognito_allowed_emails" {
  description = "List of specific allowed email addresses for signup (e.g., ['user@example.com'])"
  type        = list(string)
  default     = []
}
```

## Managing the Allowlist

### Option 1: Environment-Specific Variables File (Recommended)

Create or update your environment-specific Terraform variables file:

**For Dev Environment** (`terraform/terraform.tfvars.dev`):

```hcl
cognito_allowed_domains = ["@dodion.co.uk"]
cognito_allowed_emails = [
  "guest@example.com",
  "test@anydomain.com"
]
```

**For Prod Environment** (`terraform/terraform.tfvars.prod`):

```hcl
cognito_allowed_domains = ["@dodion.co.uk"]
cognito_allowed_emails = [
  "admin@company.com",
  "partner@external.com"
]
```

Then apply:

```bash
# For dev
terraform workspace select dev
terraform apply -var-file=terraform.tfvars.dev

# For prod
terraform workspace select prod
terraform apply -var-file=terraform.tfvars.prod
```

### Option 2: Command-Line Variables

Override variables directly in the Terraform command:

```bash
terraform apply \
  -var='cognito_allowed_domains=["@dodion.co.uk","@example.com"]' \
  -var='cognito_allowed_emails=["user@test.com","admin@demo.com"]'
```

### Option 3: Update Defaults in variables.tf

Edit `terraform/variables.tf` directly (not recommended for production):

```hcl
variable "cognito_allowed_domains" {
  description = "List of allowed email domains for signup (e.g., ['@dodion.co.uk'])"
  type        = list(string)
  default     = ["@dodion.co.uk", "@example.com"]  # Updated default
}

variable "cognito_allowed_emails" {
  description = "List of specific allowed email addresses for signup (e.g., ['user@example.com'])"
  type        = list(string)
  default     = ["guest@test.com"]  # Updated default
}
```

## Examples

### Example 1: Domain-Only Allowlist

Allow all emails from `@dodion.co.uk`:

```hcl
cognito_allowed_domains = ["@dodion.co.uk"]
cognito_allowed_emails = []
```

**Result:**
- ✅ `user@dodion.co.uk` - Allowed
- ✅ `admin@dodion.co.uk` - Allowed
- ❌ `user@example.com` - Blocked
- ❌ `test@other.com` - Blocked

### Example 2: Multiple Domains

Allow emails from multiple domains:

```hcl
cognito_allowed_domains = ["@dodion.co.uk", "@partner.com"]
cognito_allowed_emails = []
```

**Result:**
- ✅ `user@dodion.co.uk` - Allowed
- ✅ `admin@partner.com` - Allowed
- ❌ `user@example.com` - Blocked

### Example 3: Domain + Specific Emails

Allow domain plus specific exceptions:

```hcl
cognito_allowed_domains = ["@dodion.co.uk"]
cognito_allowed_emails = ["guest@example.com", "test@anydomain.com"]
```

**Result:**
- ✅ `user@dodion.co.uk` - Allowed (domain match)
- ✅ `guest@example.com` - Allowed (specific email)
- ✅ `test@anydomain.com` - Allowed (specific email)
- ❌ `other@example.com` - Blocked (not in specific list)
- ❌ `user@other.com` - Blocked

### Example 4: Specific Emails Only

Allow only specific emails (no domain allowlist):

```hcl
cognito_allowed_domains = []
cognito_allowed_emails = [
  "admin@company.com",
  "partner@external.com",
  "test@demo.com"
]
```

**Result:**
- ✅ `admin@company.com` - Allowed
- ✅ `partner@external.com` - Allowed
- ❌ `user@company.com` - Blocked (not in list)
- ❌ `admin@other.com` - Blocked

## Adding or Removing Emails

### Adding a New Email

1. Edit your environment's `terraform.tfvars` file (e.g., `terraform.tfvars.dev`)
2. Add the email to the `cognito_allowed_emails` list:

```hcl
cognito_allowed_emails = [
  "existing@example.com",
  "newuser@test.com"  # Add this line
]
```

3. Apply the changes:

```bash
terraform apply -var-file=terraform.tfvars.dev
```

The Lambda function's environment variables will be updated automatically, and the new email will be allowed immediately for new signups.

### Removing an Email

1. Edit your environment's `terraform.tfvars` file
2. Remove the email from the `cognito_allowed_emails` list
3. Apply the changes:

```bash
terraform apply -var-file=terraform.tfvars.dev
```

**Note:** Removing an email from the allowlist does not affect existing users. It only prevents new signups with that email.

### Adding a New Domain

1. Edit your environment's `terraform.tfvars` file
2. Add the domain to the `cognito_allowed_domains` list:

```hcl
cognito_allowed_domains = [
  "@dodion.co.uk",
  "@newpartner.com"  # Add this line
]
```

3. Apply the changes:

```bash
terraform apply -var-file=terraform.tfvars.dev
```

## Domain Format

Domains should include the `@` symbol:

- ✅ Correct: `"@dodion.co.uk"`
- ❌ Incorrect: `"dodion.co.uk"` (will still work, but less clear)

The Lambda function automatically normalizes domains to include `@` if missing, but it's best practice to include it.

## Implementation Details

### Lambda Function

The PreSignUp Lambda function is located at:
- **Handler**: `lambda-handlers/cognito-presignup/index.js`
- **Runtime**: Node.js 20.x
- **Timeout**: 10 seconds
- **Memory**: 128 MB

### Environment Variables

The Lambda function receives environment variables from Terraform:

- `ALLOWED_DOMAINS`: Comma-separated list (e.g., `"@dodion.co.uk,@example.com"`)
- `ALLOWED_EMAILS`: Comma-separated list (e.g., `"user@test.com,admin@demo.com"`)

These are automatically set by Terraform from the `cognito_allowed_domains` and `cognito_allowed_emails` variables.

### Terraform Resources

The allowlist is implemented through:

1. **Lambda Function** (`aws_lambda_function.cognito_presignup`):
   - Validates emails during signup
   - Environment variables set from Terraform variables

2. **Lambda Permission** (`aws_lambda_permission.cognito_presignup`):
   - Allows Cognito to invoke the Lambda function

3. **Cognito User Pool** (`aws_cognito_user_pool.users`):
   - Has `lambda_config.pre_sign_up` pointing to the Lambda function

## Troubleshooting

### Signup Still Works for Unauthorized Emails

1. Check that Terraform changes were applied:
   ```bash
   terraform plan -var-file=terraform.tfvars.dev
   ```

2. Verify Lambda environment variables in AWS Console:
   - Go to Lambda → `syniad-dev-cognito-presignup` → Configuration → Environment variables
   - Check that `ALLOWED_DOMAINS` and `ALLOWED_EMAILS` match your configuration

3. Check CloudWatch Logs for the Lambda function:
   - Look for validation logs showing which emails are being checked

### Error: "Signup is restricted to invited users"

This is expected behavior for unauthorized emails. To allow a specific email:

1. Add it to `cognito_allowed_emails` in your Terraform variables
2. Run `terraform apply`
3. The user can now sign up

### Terraform Apply Fails

If Terraform apply fails when updating the allowlist:

1. Check that the Lambda function exists:
   ```bash
   terraform state list | grep cognito_presignup
   ```

2. Verify the Lambda handler file exists:
   ```bash
   ls -la lambda-handlers/cognito-presignup/index.js
   ```

3. Check for syntax errors in your `terraform.tfvars` file:
   ```bash
   terraform validate
   ```

## Best Practices

1. **Use Environment-Specific Files**: Keep different allowlists for dev and prod
2. **Version Control**: Commit `terraform.tfvars` files to track allowlist changes
3. **Document Changes**: Add comments in `terraform.tfvars` explaining why specific emails were added
4. **Regular Review**: Periodically review the allowlist to remove unused emails
5. **Domain First**: Prefer domain allowlists over individual emails when possible

## Security Considerations

- The allowlist is enforced at the Cognito level, preventing unauthorized signups before account creation
- Existing users are not affected by allowlist changes
- The Lambda function logs all validation attempts (check CloudWatch Logs)
- Environment variables in Lambda are encrypted at rest by AWS

## Related Documentation

- [Authentication Requirements](./AUTH-REQUIREMENTS.md)
- [Cognito Security](./COGNITO-SECURITY.md)
- [Authentication State](./AUTH-STATE.md)

