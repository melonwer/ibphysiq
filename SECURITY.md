# Security Policy

## Supported Versions

We currently support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email the maintainer directly at [your-email@domain.com] (replace with actual contact)
3. Include a clear description of the vulnerability and steps to reproduce
4. We will respond within 48 hours to acknowledge receipt

## Security Best Practices

### API Key Management
- Never commit API keys or secrets to the repository
- Use environment variables for all sensitive configuration
- Rotate API keys regularly
- Use minimal-permission API keys when possible

### Environment Files
- Never commit `.env.local`, `.env.production`, or any files containing real credentials
- Use `.env.example` as a template with placeholder values only
- Add all environment files to `.gitignore`

### Deployment Security
- Use HTTPS in production
- Implement proper CORS policies
- Monitor API usage and set rate limits
- Use environment variable references in deployment configs (e.g., Vercel)

### Dependencies
- Regularly update dependencies to patch security vulnerabilities
- Use `npm audit` to check for known vulnerabilities
- Review dependency licenses and maintainership

## Known Security Considerations

1. **API Keys**: This application requires various AI service API keys. Ensure these are kept secure.
2. **Rate Limiting**: Built-in rate limiting helps prevent API abuse, but monitor usage patterns.
3. **Input Validation**: Question generation uses user inputs - we validate and sanitize all inputs.
4. **CORS**: Properly configured for API endpoints to prevent unauthorized cross-origin requests.

## Security Updates

Security updates will be published as patch versions and documented in the [RELEASE_NOTES.md](./RELEASE_NOTES.md).

## Responsible Disclosure

We appreciate the security research community and will acknowledge contributors who responsibly disclose vulnerabilities.