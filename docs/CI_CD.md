# CI/CD Pipeline Guide

This document describes the continuous integration and deployment setup for the IB Physics Practice Generator.

## GitHub Actions Workflows

### CI/CD Pipeline (`ci.yml`)

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
    - uses: actions/checkout@v4

    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run linting
      run: npm run lint

    - name: Run tests
      run: npm test -- --coverage --watchAll=false

    - name: Build application
      run: npm run build

    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        token: ${{ secrets.CODECOV_TOKEN }}

  security:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Run npm audit
      run: npm audit --audit-level=moderate

    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'

    - name: Upload Trivy scan results
      uses: github/codeql-action/upload-sarif@v2
      if: always()
      with:
        sarif_file: 'trivy-results.sarif'

  deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v2

    - name: Build and push Docker image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.docker-registry }}
        ECR_REPOSITORY: ib-physics-generator
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

    - name: Deploy to ECS
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ecs/task-definition.json
        service: ib-physics-service
        cluster: ib-physics-cluster
        wait-for-service-stability: true
```

### Deployment Workflows

#### Vercel Deployment (`deploy-vercel.yml`)

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Install Vercel CLI
      run: npm install -g vercel

    - name: Pull Vercel environment information
      run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}

    - name: Build project
      run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

    - name: Deploy project
      run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

#### Railway Deployment (`deploy-railway.yml`)

```yaml
name: Deploy to Railway

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Install Railway CLI
      run: npm install -g @railway/cli

    - name: Deploy to Railway
      run: railway deploy
      env:
        RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## Local Development Setup

### Development Workflow

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Build for production
npm run build
```

### Pre-commit Hooks

```bash
# Install husky for git hooks
npx husky install

# Add pre-commit hook
echo "#!/usr/bin/env sh
npx lint-staged
" > .husky/pre-commit

# Add commit-msg hook
echo "#!/usr/bin/env sh
npx --no-install commitizen --hook \$1 \$2
" > .husky/commit-msg
```

### Linting Configuration

```javascript
// .lintstagedrc.js
module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix',
    'prettier --write'
  ],
  '*.{json,css,md}': [
    'prettier --write'
  ]
};
```

## Testing Strategy

### Unit Tests

```javascript
// Example test structure
describe('QuestionGenerationOrchestrator', () => {
  let orchestrator;
  let mockLlamaService;
  let mockOpenRouterService;

  beforeEach(() => {
    mockLlamaService = {
      generateQuestion: jest.fn()
    };
    mockOpenRouterService = {
      refineQuestion: jest.fn()
    };
    orchestrator = new QuestionGenerationOrchestrator(
      mockLlamaService,
      mockOpenRouterService
    );
  });

  test('should generate and refine question', async () => {
    const topic = IBPhysicsSubtopic.KINEMATICS;
    const mockQuestion = {
      questionText: 'Test question',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'A'
    };

    mockLlamaService.generateQuestion.mockResolvedValue(mockQuestion);
    mockOpenRouterService.refineQuestion.mockResolvedValue(mockQuestion);

    const result = await orchestrator.generateQuestion(topic);

    expect(result).toEqual(mockQuestion);
    expect(mockLlamaService.generateQuestion).toHaveBeenCalledWith(topic);
    expect(mockOpenRouterService.refineQuestion).toHaveBeenCalledWith(mockQuestion);
  });
});
```

### Integration Tests

```javascript
// API integration test
const request = require('supertest');
const app = require('../app');

describe('POST /api/generate-question', () => {
  test('should generate question successfully', async () => {
    const response = await request(app)
      .post('/api/generate-question')
      .send({
        topic: 'kinematics',
        difficulty: 'standard',
        type: 'multiple-choice'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('question');
  });

  test('should handle invalid topic', async () => {
    const response = await request(app)
      .post('/api/generate-question')
      .send({
        topic: 'invalid-topic',
        difficulty: 'standard',
        type: 'multiple-choice'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'INVALID_REQUEST');
  });
});
```

### E2E Tests

```javascript
// E2E test with Playwright
const { test, expect } = require('@playwright/test');

test('should generate question on form submission', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Select topic
  await page.selectOption('[data-testid="topic-selector"]', 'kinematics');

  // Select difficulty
  await page.selectOption('[data-testid="difficulty-selector"]', 'standard');

  // Select type
  await page.selectOption('[data-testid="type-selector"]', 'multiple-choice');

  // Click generate
  await page.click('[data-testid="generate-button"]');

  // Wait for result
  await page.waitForSelector('[data-testid="question-display"]');

  // Verify question appears
  const questionText = await page.textContent('[data-testid="question-text"]');
  expect(questionText).toBeTruthy();
  expect(questionText.length).toBeGreaterThan(10);
});
```

## Quality Gates

### Code Quality Metrics

- **Test Coverage:** Minimum 80% coverage required
- **Code Duplication:** Maximum 5% duplication allowed
- **Complexity:** Maximum cyclomatic complexity of 10
- **Maintainability:** Minimum A grade from Code Climate

### Security Requirements

- **Dependency Vulnerabilities:** No high or critical vulnerabilities
- **Secrets Management:** No secrets committed to repository
- **Container Security:** Base images must be from trusted sources
- **Access Control:** Least privilege principle applied

### Performance Benchmarks

- **Build Time:** Maximum 5 minutes
- **Bundle Size:** Maximum 500KB for main bundle
- **First Contentful Paint:** Maximum 2 seconds
- **Lighthouse Score:** Minimum 90 for all categories

## Deployment Environments

### Development Environment

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev
```

### Staging Environment

```yaml
# Staging configuration
environment:
  NODE_ENV: staging
  ALLOWED_ORIGINS: https://staging.ibphysics.app
  LOG_LEVEL: debug
  REDIS_URL: redis://staging-redis:6379
```

### Production Environment

```yaml
# Production configuration
environment:
  NODE_ENV: production
  ALLOWED_ORIGINS: https://ibphysics.app
  LOG_LEVEL: warn
  REDIS_URL: redis://production-redis:6379
  MONITORING_ENABLED: true
  ALERTS_ENABLED: true
```

## Monitoring and Alerting

### Application Monitoring

```javascript
// Monitoring setup
const Sentry = require('@sentry/nextjs');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Console(),
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection()
  ]
});
```

### Infrastructure Monitoring

```yaml
# Prometheus metrics
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'ib-physics-app'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics'
```

### Alerting Rules

```yaml
# Alert manager configuration
groups:
  - name: ib-physics-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors per second"

      - alert: SlowResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow response time detected"
          description: "95th percentile response time is {{ $value }}s"
```

## Rollback Strategy

### Automated Rollback

```yaml
# Rollback workflow
name: Rollback Deployment

on:
  workflow_dispatch:
    inputs:
      tag:
        description: 'Tag to rollback to'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest

    steps:
    - name: Rollback to previous version
      run: |
        # Stop current deployment
        kubectl scale deployment ib-physics --replicas=0

        # Deploy previous version
        kubectl set image deployment/ib-physics app=ib-physics:${{ github.event.inputs.tag }}

        # Scale up
        kubectl scale deployment ib-physics --replicas=3

        # Wait for rollout
        kubectl rollout status deployment/ib-physics
```

### Manual Rollback Checklist

- [ ] Identify the issue causing rollback
- [ ] Notify stakeholders
- [ ] Scale down current deployment
- [ ] Deploy previous stable version
- [ ] Verify application health
- [ ] Update monitoring dashboards
- [ ] Communicate with users
- [ ] Plan fix for the issue

## Best Practices

### Branch Protection

```yaml
# GitHub branch protection rules
required_status_checks:
  strict: true
  contexts:
    - "test"
    - "lint"
    - "security-scan"

required_pull_request_reviews:
  required_approving_review_count: 2
  dismiss_stale_reviews: true
  require_code_owner_reviews: true

restrictions:
  enforce_admins: true
  allow_force_pushes: false
  allow_deletions: false
```

### Code Review Guidelines

- **Review Checklist:**
  - [ ] Code follows style guidelines
  - [ ] Tests are included and passing
  - [ ] Documentation is updated
  - [ ] Security implications reviewed
  - [ ] Performance impact assessed

- **Review Process:**
  1. Automated checks pass
  2. Peer review by at least 2 team members
  3. Code owner approval for critical changes
  4. Merge after all requirements met

### Release Process

1. **Version Bump:**
   ```bash
   npm version patch  # or minor, major
   git push --tags
   ```

2. **Changelog Update:**
   ```markdown
   ## [1.2.3] - 2024-01-15
   ### Added
   - New feature description

   ### Fixed
   - Bug fix description

   ### Changed
   - Breaking change description
   ```

3. **Release Creation:**
   - Create GitHub release
   - Tag with version number
   - Include changelog
   - Attach build artifacts

## Troubleshooting

### Common CI/CD Issues

**Build Failures:**
```bash
# Check build logs
npm run build 2>&1 | tee build.log

# Debug Node.js issues
npm config list
node --version
npm --version
```

**Test Failures:**
```bash
# Run tests locally
npm test -- --verbose

# Debug specific test
npm test -- --testNamePattern="should generate question"
```

**Deployment Issues:**
```bash
# Check deployment logs
kubectl logs deployment/ib-physics

# Verify environment variables
kubectl exec -it deployment/ib-physics -- env

# Check service health
curl https://your-app.com/api/generate-question?action=health
```

### Performance Optimization

**Bundle Analysis:**
```bash
# Analyze bundle size
npm install -g webpack-bundle-analyzer
npm run build -- --analyze
```

**Database Optimization:**
```javascript
// Connection pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**Caching Strategy:**
```javascript
// Redis caching
const cache = require('redis').createClient();

const getCachedQuestion = async (key) => {
  const cached = await cache.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  return null;
};
```

---

<p align="center">🚀 Continuous Integration & Deployment Best Practices</p>