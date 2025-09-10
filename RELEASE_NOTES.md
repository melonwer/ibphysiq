# Release Notes

## [1.0.0] - 2025-08-30

### Added
- AI-powered IB Physics question generation using fine-tuned Llama 3.1 8B and Gemini 2.5 Flash
- Support for multiple AI providers: Lightning AI, Hugging Face, Google Gemini, and local models
- Question generation for both multiple-choice (Paper 1) and long-answer (Paper 2) formats
- Complete IB Physics curriculum coverage with 25 subtopics across all difficulty levels
- Modern, responsive web interface with real-time generation progress
- Comprehensive settings management UI at [`/settings`](app/settings/page.tsx:1)
- Optional Lightning AI (LIT) hosted inference support with server-side proxy
- In-app Settings UI and server-side settings API to configure provider credentials at runtime
- Owner fallback credentials system from [`data/settings.json`](data/settings.json:1)
- Robust parsing of LIT responses that embed JSON in a `response` field
- Clear per-request timeouts and safer retry behavior (local TGI 403 is fast-failed)
- Rate limiting and cost tracking across all AI providers
- Advanced validation engine ensuring IB Physics compliance and question quality
- Demo mode functionality for testing without API keys
- Self-hosting support with quantized model deployment
- RESTful API with comprehensive endpoints for programmatic access
- Built-in health checks and service monitoring
- JSONL data persistence for generated questions
- Comprehensive documentation and deployment guides

### Features
**Core API Endpoints:**
- [`/api/generate-question`](app/api/generate-question/route.ts:1) - Main question generation endpoint
- [`/api/settings`](app/api/settings/route.ts:1) - Settings management (GET/POST)
- [`/api/predict-proxy`](app/api/predict-proxy/route.ts:1) - Server-side proxy for Lightning AI
- [`/api/admin/reload`](app/api/admin/reload/route.ts:1) - Admin endpoint for service reloads

**UI Components:**
- Settings management UI at [`/settings`](app/settings/page.tsx:1)
- Modern responsive interface with [`components/settings-panel.tsx`](components/settings-panel.tsx:1)
- Real-time generation progress indicators

### Security
- Server-side API token management with masked display
- Owner credential fallback system for demo deployments
- Rate limiting and cost tracking protection
- Secure token storage in [`data/settings.json`](data/settings.json:1)
- Server-side proxy to keep tokens secure from client exposure

### Configuration
**Environment Variables:**
- `OPENROUTER_API_KEY` - OpenRouter API key (required for full functionality)
- `LIT_API_URL` - Lightning AI endpoint URL (optional)
- `LIT_API_TOKEN` - Lightning AI API token (optional)
- `HUGGINGFACE_API_KEY` - Hugging Face API token (optional)
- `LOCAL_TGI_URL` - Local text generation server URL (optional)

**Quick Setup:**
1. Copy [`.env.example`](.env.example:1) to `.env.local`
2. Configure via Settings UI at `/settings`
3. Or set environment variables directly
4. Run `npm run dev` to start development server

### API Examples
```bash
# Generate a question
curl -X POST "http://localhost:3000/api/generate-question" \
  -H "Content-Type: application/json" \
  -d '{"topic":"kinematics","difficulty":"standard","type":"multiple-choice"}'

# Health check
curl "http://localhost:3000/api/generate-question?action=health"

# Via Lightning AI proxy
curl -X POST "http://localhost:3000/api/predict-proxy" \
  -H "Content-Type: application/json" \
  -d '{"inputs":"Generate an IB Physics Paper 1 style multiple-choice question.","max_new_tokens":128}'
```

### Deployment
- **Production Ready**: Built-in rate limiting, error handling, and monitoring
- **Multiple Deployment Options**: Lightning AI, local models, or hybrid setups
- **Docker Support**: Containerized deployment available
- **Self-Hosting**: Complete local deployment with quantized models

### Technical Architecture
- **TypeScript**: Full type safety and modern development experience
- **Next.js 15**: Latest features with App Router and Server Components
- **Tailwind CSS 4**: Modern utility-first styling
- **Jest Testing**: Comprehensive test suite with 30+ test cases
- **ESLint**: Code quality and consistency enforcement

## Migration Guide

### From Demo/Development Setup
- Configure production API keys in environment or settings
- Enable owner credit fallback if needed for shared access
- Set up monitoring and log rotation for production use

### Breaking Changes
- Test setup extended for TypeScript/Jest compatibility (see [`jest.config.cjs`](jest.config.cjs:1))
- Local TGI authentication errors (403) now disable local TGI for the process
- Settings now persisted in [`data/settings.json`](data/settings.json:1) (add to `.gitignore`)

## Support & Documentation
- **Repository**: [https://github.com/melonwer/ibphysiq](https://github.com/melonwer/ibphysiq)
- **Issues**: [https://github.com/melonwer/ibphysiq/issues](https://github.com/melonwer/ibphysiq/issues)
- **Documentation**: Complete API and deployment guides in `/docs`
- **Security**: See [SECURITY.md](docs/SECURITY.md:1) for security guidelines

---

*For deployment assistance or production configuration support, please open an issue in the repository.*