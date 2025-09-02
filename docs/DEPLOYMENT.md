# 🚀 Deploy Your Own IB Physics Generator!

**Hey future developers!** Want to run your own version of the IB Physics Generator? Whether you're a student learning about web deployment, a teacher wanting to host this for your school, or just curious about how modern apps get deployed, this guide will help you get started.

## 📋 Quick Start

### Automated Deployment (Recommended)
The project includes a complete CI/CD pipeline with automated deployments to multiple platforms:

- **🤖 Automated Releases**: Tag-based releases with semantic versioning
- **🌐 Vercel**: Automatic deployment on push to main/develop branches
- **🐳 Docker Hub**: Multi-platform container builds and publishing
- **📦 NPM**: Package publishing with proper versioning
- **🔄 Rollback**: Automated rollback procedures for failed deployments

### Manual Deployment
For quick testing or development purposes, you can deploy manually to various platforms.

---

## 🤖 Automated CI/CD Pipeline

The project includes comprehensive GitHub Actions workflows for automated deployment and release management.

### 🔄 Continuous Integration

**Workflow**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch
- Daily security scans (2 AM UTC)

**Features**:
- ✅ Lint and format checking
- 🧪 Test suite with coverage reporting
- 🔒 Security scanning (Trivy, Snyk, CodeQL)
- 🏗️ Build verification for multiple Node.js versions
- 🐳 Docker build testing
- ⚡ Performance and accessibility testing
- 📊 Comprehensive CI summary and PR comments

### 🚀 Automated Release Process

**Workflow**: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

**Triggers**:
- Git tags matching `v*.*.*` pattern (e.g., `v1.0.0`)
- Manual workflow dispatch with version input

**Process**:
1. **Validation**: Version format and semantic versioning checks
2. **Testing**: Full test suite across multiple Node.js versions
3. **Building**: Production build with asset optimization
4. **Release**: GitHub release creation with automated release notes
5. **Deployment**: Triggers deployment workflows for all platforms

**Usage**:
```bash
# Create and push a release tag
git tag v1.0.0
git push origin v1.0.0

# Or use GitHub CLI
gh release create v1.0.0 --generate-notes
```

### 🌐 Vercel Automation

**Workflow**: [`.github/workflows/deploy-vercel.yml`](../.github/workflows/deploy-vercel.yml)

**Deployments**:
- **Production**: `main` branch pushes and release tags
- **Preview**: `develop` branch pushes and pull requests
- **Development**: Manual deployments

**Features**:
- 🏥 Health check verification
- 💬 PR comment updates with deployment URLs
- 🔄 Automatic environment determination
- 📊 Deployment summaries

### 🐳 Docker Hub Automation

**Workflow**: [`.github/workflows/docker.yml`](../.github/workflows/docker.yml)

**Features**:
- 🏗️ Multi-platform builds (AMD64, ARM64)
- 🔒 Security scanning with Trivy and Hadolint
- 🧪 Container testing and health checks
- 🏷️ Semantic versioning and tagging
- 📋 SBOM and provenance generation

**Image Tags**:
- `latest`: Latest stable release
- `v1.0.0`: Specific version tags
- `develop`: Development branch builds
- `pr-123`: Pull request builds

### 📦 NPM Automation

**Workflow**: [`.github/workflows/npm-publish.yml`](../.github/workflows/npm-publish.yml)

**Features**:
- 📦 Package validation and testing
- 🔒 Security auditing
- 🧪 Installation testing
- 🏷️ Dist tag management (`latest`, `next`, `beta`, `alpha`)
- 🧪 Dry run capability

### 🔄 Rollback Automation

**Workflow**: [`.github/workflows/rollback.yml`](../.github/workflows/rollback.yml)

**Capabilities**:
- 🎯 Selective rollback (Vercel, Docker, NPM, or all)
- ⚠️ Manual confirmation for non-emergency rollbacks
- 🚨 Emergency rollback mode
- 📋 Automated incident issue creation
- 🏥 Post-rollback verification

**Usage**:
```bash
# Trigger rollback via GitHub Actions UI
# Or use GitHub CLI
gh workflow run rollback.yml \
  -f environment=all \
  -f target_version=v1.0.0 \
  -f reason="Critical security issue" \
  -f emergency=true
```

---

## 📋 Manual Deployment Options

### Quick Deployment Platforms

| Platform | Difficulty | Cost | Best For |
|----------|------------|------|----------|
| Vercel | ⭐ | Free/$ | Quick prototyping |
| Railway | ⭐⭐ | $5-10/month | Full-stack apps |
| Render | ⭐⭐ | Free/$ | Docker deployments |
| DigitalOcean App Platform | ⭐⭐⭐ | $12/month | VPS-like experience |
| AWS/GCP/Azure | ⭐⭐⭐⭐ | Variable | Enterprise |

## 🚀 Quick Deploy (Vercel)

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/melonwer/ibphysiq)

### Manual Vercel Deployment

1. **Connect Repository:**
   ```bash
   # Push to GitHub first
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Deploy on Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Configure environment variables
   - Deploy

3. **Environment Variables:**
   ```bash
   OPENROUTER_API_KEY=your_openrouter_key
   LIT_API_URL=https://your-endpoint.cloudspaces.litng.ai/predict
   LIT_API_TOKEN=your_lightning_token
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```

4. **Automated Deployment:**
   The project includes automatic Vercel deployment. Simply:
   ```bash
   # Push to main for production
   git push origin main
   
   # Push to develop for preview
   git push origin develop
   
   # Create PR for preview deployment
   gh pr create --title "Feature update"
   ```

   See [Vercel Automation](#-vercel-automation) for details.

## 🐳 Docker Deployment

### Build Docker Image

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/generate-question?action=health || exit 1

# Start application
CMD ["npm", "start"]
```

### Build and Run

```bash
# Build image
docker build -t ib-physics-generator .

# Run container
docker run -p 3000:3000 \
  -e OPENROUTER_API_KEY=your_key \
  -e LIT_API_URL=your_endpoint \
  ib-physics-generator
```

### Automated Docker Deployment

The project automatically builds and publishes Docker images:

```bash
# Pull the latest automated build
docker pull melonwer/ibphysiq:latest

# Run with environment variables
docker run -p 3000:3000 \
  -e OPENROUTER_API_KEY=your_key \
  -e LIT_API_URL=your_endpoint \
  melonwer/ibphysiq:latest
```

Available tags:
- `latest`: Latest stable release
- `v1.0.0`: Specific versions
- `develop`: Development builds

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - LIT_API_URL=${LIT_API_URL}
      - LIT_API_TOKEN=${LIT_API_TOKEN}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/generate-question?action=health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    restart: unless-stopped
```

## ☁️ Cloud Platform Deployments

### Railway

1. **Connect Repository:**
   - Go to [railway.app](https://railway.app)
   - Connect GitHub account
   - Select repository

2. **Configure Environment:**
   ```bash
   # Add these environment variables in Railway dashboard
   OPENROUTER_API_KEY=your_openrouter_key
   LIT_API_URL=https://your-endpoint.cloudspaces.litng.ai/predict
   LIT_API_TOKEN=your_lightning_token
   NODE_ENV=production
   ```

3. **Deploy:**
   - Railway auto-deploys on git push
   - Custom domain available

### Render

1. **Create Web Service:**
   - Go to [render.com](https://render.com)
   - Create New Web Service
   - Connect GitHub repository

2. **Configure Service:**
   ```bash
   # Build Command
   npm install && npm run build

   # Start Command
   npm start

   # Environment Variables
   OPENROUTER_API_KEY=your_openrouter_key
   LIT_API_URL=https://your-endpoint.cloudspaces.litng.ai/predict
   LIT_API_TOKEN=your_lightning_token
   NODE_ENV=production
   ```

### DigitalOcean App Platform

1. **Create App:**
   - Go to DigitalOcean App Platform
   - Create new app from GitHub

2. **Configure Resources:**
   - **Runtime:** Node.js
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Environment Variables:** Configure API keys

3. **Database (Optional):**
   - Add PostgreSQL database for data persistence
   - Configure connection string

## 🏢 Enterprise Deployment

### AWS EC2

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone https://github.com/melonwer/ibphysiq.git
cd ibphysiq

# Install dependencies
npm install

# Create environment file
sudo tee .env.local > /dev/null <<EOF
OPENROUTER_API_KEY=your_openrouter_key
LIT_API_URL=https://your-endpoint.cloudspaces.litng.ai/predict
LIT_API_TOKEN=your_lightning_token
NODE_ENV=production
EOF

# Build and start
npm run build
npm start

# Or use PM2 for production
sudo npm install -g pm2
pm2 start npm --name "ib-physics" -- start
pm2 startup
pm2 save
```

### AWS ECS/Fargate

```yaml
# task-definition.json
{
  "family": "ib-physics-generator",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "ib-physics-app",
      "image": "your-registry/ib-physics-generator:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "OPENROUTER_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:123456789012:secret:openrouter-api-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ib-physics-generator",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | No | `development` |
| `OPENROUTER_API_KEY` | OpenRouter API key | Yes* | - |
| `LIT_API_URL` | Lightning AI endpoint | No | - |
| `LIT_API_TOKEN` | Lightning AI token | No | - |
| `HUGGINGFACE_API_KEY` | Hugging Face token | No | - |
| `LOCAL_TGI_URL` | Local model server | No | - |
| `NEXT_PUBLIC_APP_URL` | App URL | No | `http://localhost:3000` |
| `ALLOWED_ORIGINS` | CORS origins | No | `http://localhost:3000` |

*Required for full functionality; app works in demo mode without it

### Secrets Management

For production deployments, see the [Secrets Guide](SECRETS_GUIDE.md) for detailed information on:
- Required GitHub secrets
- Environment variable configuration
- Security best practices
- Platform-specific setup instructions

### Settings Configuration

After deployment, configure settings via the web interface:

1. Go to `https://your-app.com/settings`
2. Enter your API credentials
3. Configure provider preferences
4. Test the configuration

## 📊 Monitoring & Maintenance

### Health Checks

```bash
# Health check endpoint
curl https://your-app.com/api/generate-question?action=health

# Service statistics
curl https://your-app.com/api/generate-question?action=stats
```

### Logs

```bash
# Vercel logs
vercel logs

# Railway logs
railway logs

# Docker logs
docker logs container-name

# PM2 logs
pm2 logs ib-physics
```

### Performance Monitoring

- **Response Times:** Monitor API response times
- **Error Rates:** Track error rates and types
- **Usage Patterns:** Monitor question generation patterns
- **Cost Tracking:** Monitor API usage costs

## 🔒 Security

### SSL/TLS

- All deployment platforms provide SSL certificates
- Custom domains require DNS configuration
- Force HTTPS in production

### Environment Security

```bash
# Never commit secrets
echo ".env*" >> .gitignore

# Use secure random strings
SESSION_SECRET=$(openssl rand -hex 32)
API_SECRET_KEY=$(openssl rand -hex 32)
```

### Network Security

- Configure firewalls
- Use VPC/security groups
- Implement rate limiting
- Enable CORS properly

## 🚀 Scaling

### Horizontal Scaling

```yaml
# docker-compose scale
version: '3.8'
services:
  app:
    build: .
    scale: 3
    ports:
      - "3000-3002:3000"
```

### Load Balancing

```nginx
# nginx.conf
upstream ib_physics_app {
    server app1:3000;
    server app2:3000;
    server app3:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://ib_physics_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔄 Updates & Rollbacks

### Automated Updates

**Production Releases:**
```bash
# Create release tag (triggers all deployments)
git tag v1.1.0
git push origin v1.1.0
```

**Hotfixes:**
```bash
# Emergency deployment
gh workflow run release.yml -f version=v1.0.1 -f prerelease=false
```

### Automated Rollback

**Emergency Rollback:**
```bash
# Rollback all services immediately
gh workflow run rollback.yml \
  -f environment=all \
  -f target_version=v1.0.0 \
  -f reason="Critical issue" \
  -f emergency=true
```

**Selective Rollback:**
```bash
# Rollback only Vercel deployment
gh workflow run rollback.yml \
  -f environment=vercel \
  -f target_version=v1.0.0 \
  -f reason="Frontend issue"
```

### Manual Rollback Procedures

**Git Rollback:**
```bash
# Revert to previous version
git log --oneline -10
git revert HEAD~1
git push origin main
```

**Docker Rollback:**
```bash
# Manual Docker tag rollback
docker pull melonwer/ibphysiq:v1.0.0
docker tag melonwer/ibphysiq:v1.0.0 melonwer/ibphysiq:latest
docker push melonwer/ibphysiq:latest
```

**Vercel Rollback:**
```bash
# Use Vercel CLI for manual rollback
vercel --prod --yes
vercel alias set previous-deployment.vercel.app your-domain.com
```

## 🆘 Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

**Runtime Errors:**
```bash
# Check logs
docker logs container-name
# Check environment
docker exec -it container-name env
```

**Performance Issues:**
```bash
# Monitor resources
docker stats
# Check memory usage
pm2 monit
```

### Support

- **Documentation:** [API Guide](API.md) | [Security Guide](SECURITY.md) | [Secrets Guide](SECRETS_GUIDE.md)
- **Issues:** [GitHub Issues](https://github.com/melonwer/ibphysiq/issues)
- **Community:** [GitHub Discussions](https://github.com/melonwer/ibphysiq/discussions)
- **CI/CD:** [GitHub Actions](https://github.com/melonwer/ibphysiq/actions)

## 📋 Deployment Checklist

### Automated Deployment Setup
- [ ] GitHub secrets configured (see [Secrets Guide](SECRETS_GUIDE.md))
- [ ] Vercel project linked and environment variables set
- [ ] Docker Hub repository created and credentials configured
- [ ] NPM package publishing permissions granted
- [ ] Environment protection rules configured
- [ ] Branch protection rules enabled

### Pre-Release
- [ ] All tests passing in CI pipeline
- [ ] Security scans completed without critical issues
- [ ] Documentation updated
- [ ] Release notes prepared
- [ ] Staging deployment tested

### Post-Release
- [ ] All deployment workflows completed successfully
- [ ] Production health checks passing
- [ ] Monitoring alerts configured
- [ ] Performance metrics baseline established
- [ ] Rollback procedures tested

### Ongoing Maintenance
- [ ] Regular dependency updates via Dependabot
- [ ] Weekly security scan reviews
- [ ] Monthly deployment pipeline audits
- [ ] Quarterly rollback procedure drills
- [ ] Token rotation schedule maintained

---

## 🔗 Related Documentation

- **[🔐 Secrets Guide](SECRETS_GUIDE.md)**: Complete guide to required secrets and environment variables
- **[🛡️ Security Guide](SECURITY.md)**: Security best practices and guidelines
- **[📖 API Documentation](API.md)**: API endpoints and usage
- **[🧪 Testing Report](TESTING_REPORT.md)**: Test coverage and quality metrics
- **[📋 Release Checklist](RELEASE_CHECKLIST.md)**: Complete release process checklist

---

<p align="center">Happy deploying! 🚀</p>