/**
 * Cognito PreSignUp Lambda Trigger
 * 
 * Validates that user signups are restricted to allowed email domains
 * and specific allowed email addresses.
 * 
 * Environment Variables:
 * - ALLOWED_DOMAINS: Comma-separated list of allowed email domains (e.g., "@dodion.co.uk,@example.com")
 * - ALLOWED_EMAILS: Comma-separated list of specific allowed emails (e.g., "user@anydomain.com,admin@other.com")
 */

exports.handler = async (event) => {
  console.log('PreSignUp event:', JSON.stringify(event, null, 2));
  
  // Extract email from event
  const email = event.request?.userAttributes?.email;
  
  if (!email) {
    console.error('No email found in userAttributes');
    throw new Error('Email is required for signup');
  }
  
  // Normalize email (lowercase, trim)
  const normalizedEmail = email.toLowerCase().trim();
  
  // Get allowed domains and emails from environment variables
  const allowedDomainsStr = process.env.ALLOWED_DOMAINS || '';
  const allowedEmailsStr = process.env.ALLOWED_EMAILS || '';
  
  // Parse comma-separated lists (trim each item)
  const allowedDomains = allowedDomainsStr
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(d => d.length > 0);
  
  const allowedEmails = allowedEmailsStr
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);
  
  console.log('Validation check:', {
    email: normalizedEmail,
    allowedDomains,
    allowedEmails
  });
  
  // Check if email matches any specific allowed email
  if (allowedEmails.length > 0 && allowedEmails.includes(normalizedEmail)) {
    console.log('Email matches allowed specific email:', normalizedEmail);
    return event; // Allow signup
  }
  
  // Check if email domain matches any allowed domain
  for (const domain of allowedDomains) {
    // Normalize domain (ensure it starts with @)
    const normalizedDomain = domain.startsWith('@') ? domain : `@${domain}`;
    
    if (normalizedEmail.endsWith(normalizedDomain)) {
      console.log('Email domain matches allowed domain:', normalizedDomain);
      return event; // Allow signup
    }
  }
  
  // Email not allowed
  const errorMessage = 'Signup is restricted to invited users. Please contact an administrator.';
  console.error('Signup rejected:', {
    email: normalizedEmail,
    allowedDomains,
    allowedEmails
  });
  
  throw new Error(errorMessage);
};

