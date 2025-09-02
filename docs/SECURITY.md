# 🔒 Keeping Your IB Physics Generator Safe

**Learning about security?** Great! Whether you're a student building your first web app, an educator hosting this for your school, or just curious about web security, this guide explains how to keep everything safe and secure.

## 😱 Why Security Matters

Imagine someone could:
- Steal your API keys and run up huge bills
- Break your app and make it unusable for students
- Access other people's data
- Use your server to attack other websites

Scary, right? Let's learn how to prevent this!

## 🔑 Rule #1: Never Share Your Secret Keys!

### The Golden Rule
**NEVER put real API keys in your code!** Here's why:

```bash
# ❌ NEVER DO THIS - Everyone can see your secrets!
echo "OPENROUTER_API_KEY=sk-or-real-key-here" >> .env
git add .env
git commit -m "Oops, I just shared my secrets with the world!"

# ✅ DO THIS INSTEAD - Keep secrets local
echo "OPENROUTER_API_KEY=sk-or-real-key-here" >> .env.local
echo ".env.local" >> .gitignore
```

### Why This Matters
If you accidentally commit real API keys:
1. Anyone can find them on GitHub
2. They can use your keys to make expensive AI calls
3. You'll get a surprise bill!
4. Your app might stop working when you hit limits

### Server-Side Storage

API keys should be stored server-side only:

```javascript
// ✅ GOOD - Server-side only
const apiKey = process.env.OPENROUTER_API_KEY;

// ❌ BAD - Client-side exposure
const config = {
  apiKey: process.env.OPENROUTER_API_KEY // Exposed to browser!
};
```

### Key Rotation

Regularly rotate API keys:

1. **Generate new key** from provider dashboard
2. **Update environment variables** in production
3. **Test the new key** with health checks
4. **Revoke old key** after confirming new key works
5. **Update documentation** if needed

## 🛡️ Input Validation

### Request Validation

All user inputs must be validated:

```javascript
// Input validation example
function validateQuestionRequest(body) {
  const schema = {
    topic: 'string',
    difficulty: ['standard', 'higher'],
    type: ['multiple-choice', 'long-answer']
  };

  // Validate required fields
  if (!body.topic || !schema.topic.includes(typeof body.topic)) {
    throw new Error('Invalid topic');
  }

  // Sanitize inputs
  return {
    topic: sanitizeString(body.topic),
    difficulty: body.difficulty || 'standard',
    type: body.type || 'multiple-choice'
  };
}
```

### Content Security

- **XSS Prevention**: Sanitize all user-generated content
- **SQL Injection**: Use parameterized queries (if database is added)
- **Command Injection**: Validate and sanitize shell commands
- **Path Traversal**: Validate file paths

## 🔒 Authentication & Authorization

### API Access Control

```javascript
// Rate limiting implementation
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
```

### CORS Configuration

Restrict cross-origin requests:

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ALLOWED_ORIGINS || 'http://localhost:3000'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          }
        ]
      }
    ];
  }
};
```

## 📊 Logging & Monitoring

### Security Logging

Log security events without exposing sensitive data:

```javascript
// ✅ GOOD - Safe logging
console.log(`Question generated for topic: ${topic} by IP: ${maskIP(req.ip)}`);

// ❌ BAD - Exposes sensitive data
console.log(`Request from ${req.ip} with key: ${apiKey}`);
```

### Error Handling

Don't expose internal system details:

```javascript
// ✅ GOOD - Generic error message
app.use((err, req, res, next) => {
  console.error(err.stack); // Log full error server-side
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// ❌ BAD - Exposes internal details
app.use((err, req, res, next) => {
  res.status(500).json({
    error: err.message, // May expose sensitive information
    stack: err.stack
  });
});
```

## 🚀 Production Deployment

### Environment Security

**Use secure environment management:**

```bash
# Use environment-specific variables
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
SESSION_SECRET=your-secure-random-string

# Never use default or weak secrets
API_KEY=your-secure-api-key
```

### HTTPS Enforcement

Always use HTTPS in production:

```javascript
// next.config.js
module.exports = {
  // Force HTTPS in production
  ...(process.env.NODE_ENV === 'production' && {
    headers: [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ]
  })
};
```

## 🔍 Security Checklist

### Pre-Deployment

- [ ] All API keys are in environment variables
- [ ] No secrets committed to version control
- [ ] Input validation implemented for all endpoints
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] HTTPS enabled in production
- [ ] Security headers set
- [ ] Error messages don't expose sensitive information

### Ongoing Security

- [ ] Regularly update dependencies
- [ ] Monitor for security vulnerabilities
- [ ] Rotate API keys periodically
- [ ] Review access logs for suspicious activity
- [ ] Keep backup of environment configurations (encrypted)
- [ ] Test security measures regularly

## 🚨 Incident Response

### Security Breach Procedure

1. **Immediate Action:**
   - Revoke compromised API keys
   - Change all passwords and secrets
   - Notify affected users if applicable

2. **Investigation:**
   - Review access logs
   - Identify breach scope
   - Document findings

3. **Recovery:**
   - Deploy security patches
   - Restore from clean backup
   - Test all systems

4. **Communication:**
   - Notify users if data was compromised
   - Provide transparency about the incident
   - Outline preventive measures

### Contact Information

- **Security Issues:** security@ibphysics.app
- **Emergency Contact:** +1-555-0123
- **Response Time:** Within 24 hours for security issues

## 🔧 Security Tools

### Recommended Tools

- **Dependency Scanning:** `npm audit`, `snyk`
- **Secret Detection:** `git-secrets`, `trufflehog`
- **Vulnerability Testing:** OWASP ZAP, Burp Suite
- **Container Security:** Trivy, Clair
- **Monitoring:** Sentry, LogRocket

### Automated Security

```yaml
# .github/workflows/security.yml
name: Security Checks
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run npm audit
        run: npm audit --audit-level=moderate
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
```

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [API Security Checklist](https://github.com/shieldfy/API-Security-Checklist)

## 🤝 Reporting Security Issues

If you discover a security vulnerability, please:

1. **Don't create a public issue**
2. **Email me directly:** dmitrii.burkov@proton.me
3. **Include details:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge your report within 24 hours and provide regular updates on our progress.

---

<p align="center">Security is everyone's responsibility</p>