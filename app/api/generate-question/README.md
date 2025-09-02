# IB Physics Question Generator API

This API provides AI-powered question generation for IB Physics using a sophisticated two-model pipeline combining fine-tuned Llama 3.1 8B and Gemini 2.5 Flash.

## Features

- **Two-Model AI Pipeline**: Combines Llama for generation with Gemini for refinement
- **24 IB Physics Subtopics**: Complete coverage of current IB Physics curriculum
- **Quality Validation**: Multi-stage validation for format, physics accuracy, and IB compliance
- **Rate Limiting**: Built-in cost control and quota management
- **Real-time Monitoring**: Health checks and usage statistics
- **Fallback Mechanisms**: Robust error handling with graceful degradation

## Endpoints

### POST `/api/generate-question`

Generate a physics question using AI.

#### Request Body

**New Format (Recommended):**
```json
{
  "topic": "kinematics",
  "difficulty": "standard",
  "type": "multiple-choice"
}
```

**Legacy Format (Backward Compatible):**
```json
{
  "prompt": "Generate a mechanics question",
  "questionType": "mcq",
  "topics": ["Mechanics"]
}
```

#### Parameters

- `topic` (required): IB Physics subtopic (see [Available Topics](#available-topics))
- `difficulty` (optional): `"standard"` or `"higher"` (default: `"standard"`)
- `type` (optional): `"multiple-choice"` or `"long-answer"` (default: `"multiple-choice"`)

#### Response

**Multiple Choice Question:**
```json
{
  "type": "mcq",
  "topic": "Kinematics",
  "question": "A car accelerates uniformly from rest at 2.0 m/s². What is the velocity after 5.0 s?",
  "options": ["5.0 m/s", "10.0 m/s", "15.0 m/s", "20.0 m/s"],
  "correct": 1,
  "explanation": [
    "Using the equation v = u + at",
    "v = 0 + 2.0 × 5.0 = 10.0 m/s"
  ],
  "theory": "Topic: Kinematics - Uniform acceleration equations",
  "metadata": {
    "processingTime": 2500,
    "modelVersions": {
      "llama": "d4ydy/ib-physics-question-generator",
      "gemini": "gemini-2.5-flash"
    },
    "refinementApplied": true,
    "generatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Long Answer Question:**
```json
{
  "type": "long",
  "topic": "Mechanics",
  "question": "A projectile is launched at 45° with initial speed 20 m/s. Calculate the maximum height and range.",
  "solution": [
    "Given: u = 20 m/s, θ = 45°, g = 9.8 m/s²",
    "Resolve into components: ux = uy = 20 cos 45° = 14.14 m/s",
    "Maximum height: h = uy²/(2g) = (14.14)²/(2×9.8) = 10.2 m",
    "Range: R = u²sin(2θ)/g = 20²×sin(90°)/9.8 = 40.8 m"
  ],
  "theory": "Topic: Projectile Motion - Parabolic trajectories under gravity"
}
```

#### Error Responses

```json
{
  "error": "Topic is required",
  "code": "INVALID_REQUEST"
}
```

```json
{
  "error": "Rate limit exceeded. Please try again later.",
  "code": "RATE_LIMITED",
  "retryAfter": 60
}
```

### GET `/api/generate-question`

Get API information and service status.

#### Query Parameters

- `action=health`: Service health check
- `action=stats`: Usage statistics and metrics
- `action=topics`: List of available topics

#### Examples

**API Information:**
```bash
curl https://your-domain.com/api/generate-question
```

**Health Check:**
```bash
curl https://your-domain.com/api/generate-question?action=health
```

**Available Topics:**
```bash
curl https://your-domain.com/api/generate-question?action=topics
```

## Available Topics

### Theme A: Space, time and motion
- `kinematics` - Motion equations and graphs
- `forces-momentum` - Newton's laws and momentum
- `work-energy-power` - Energy conservation and power
- `rigid-body-mechanics` - Rotational motion (HL only)
- `galilean-special-relativity` - Relativity principles (HL only)

### Theme B: The particulate nature of matter
- `thermal-energy-transfers` - Heat transfer mechanisms
- `greenhouse-effect` - Climate physics
- `gas-laws` - Ideal gas behavior
- `current-circuits` - Electric circuits and Ohm's law
- `thermodynamics` - Laws of thermodynamics (HL only)

### Theme C: Wave behaviour
- `simple-harmonic-motion` - Oscillatory motion
- `wave-model` - Wave properties and equations
- `wave-phenomena` - Reflection, refraction, diffraction
- `standing-waves-resonance` - Stationary waves
- `doppler-effect` - Frequency shifts

### Theme D: Fields
- `gravitational-fields` - Gravity and orbital motion
- `electric-magnetic-fields` - Field concepts and interactions
- `motion-electromagnetic-fields` - Charged particle motion
- `induction` - Electromagnetic induction (HL only)

### Theme E: Nuclear and quantum physics
- `structure-atom` - Atomic models and spectra
- `radioactive-decay` - Nuclear decay processes
- `fission` - Nuclear fission reactions
- `fusion-stars` - Fusion and stellar physics
- `quantum-physics` - Quantum mechanics (HL only)

## Rate Limits

The API implements intelligent rate limiting to manage costs and ensure service availability:

- **Gemini API**: 60 requests/minute, 32,000 tokens/minute, $5/day
- **Hugging Face**: 30 requests/minute, 10,000 tokens/minute, $2/day

Rate limits are automatically enforced with appropriate HTTP status codes (429) and retry-after headers.

## Environment Configuration

Create a `.env.local` file with your API keys:

```env
HUGGINGFACE_API_KEY=your_huggingface_api_key
GEMINI_API_KEY=your_gemini_api_key
LLAMA_MODEL_ID=d4ydy/ib-physics-question-generator

# Optional: Customize pipeline behavior
ENABLE_REFINEMENT=true
FALLBACK_TO_ORIGINAL=true
REQUIRE_MINIMUM_QUALITY=false
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_REQUEST` | Invalid parameters | 400 |
| `RATE_LIMITED` | Rate limit exceeded | 429 |
| `QUOTA_EXCEEDED` | Daily quota exceeded | 429 |
| `TIMEOUT` | Request timeout | 408 |
| `VALIDATION_FAILED` | Question validation failed | 422 |
| `GENERATION_FAILED` | General generation error | 500 |

## Monitoring

The API provides built-in monitoring endpoints:

- **Health Check**: Monitor service availability and model status
- **Usage Statistics**: Track request counts, success rates, and processing times
- **Cost Tracking**: Monitor API usage costs and budget status

## Best Practices

1. **Topic Selection**: Use specific subtopics for better question quality
2. **Error Handling**: Implement retry logic with exponential backoff
3. **Rate Limiting**: Monitor rate limit headers and implement client-side queuing
4. **Caching**: Cache generated questions to reduce API calls
5. **Monitoring**: Use health check endpoints to monitor service status

## Support

For issues or questions about the API:

1. Check the health endpoint for service status
2. Review error codes and messages
3. Monitor rate limits and quotas
4. Contact support with specific error details

## Changelog

### v1.0.0
- Complete rewrite with two-model AI pipeline
- Added 24 IB Physics subtopics
- Implemented comprehensive validation
- Added rate limiting and cost management
- Enhanced error handling and monitoring

## Using Lightning AI (LIT) — quickstart

You can use a Lightning AI hosted inference endpoint for question generation. This project supports calling Lightning directly or via a server-side proxy.

1) Create and deploy on Lightning
- Sign up / sign in at https://lightning.ai
- Deploy or select a model and get the inference endpoint URL (ends with `/predict`).
- Create an API token in the Lightning dashboard and copy it.

2) Configure the app (example `.env.local`)
```
LIT_API_URL=https://8000-dep-01k3m70zjy9sat5he7x29dkvjq-d.cloudspaces.litng.ai/predict
LIT_API_TOKEN=1816a8fa-5ce1-4b14-8a45-2d9c576fbc7b
```

3) Option A — server-direct (recommended for server deployments)
- Set the two env vars above in your server environment.
- Start the server (`npm run dev`).
- The Llama service will use Lightning for generation when available.

4) Option B — server-side proxy (recommended for client safety)
- Keep the token server-side and have clients call the proxy:
  - Server sets `LIT_API_URL` and `LIT_API_TOKEN`.
  - Client calls `/api/predict-proxy`, which forwards to the Lightning endpoint.
- Optionally set `LIT_PROXY_URL` in the client environment to point to `http://localhost:3000/api/predict-proxy`.

Sample curl (via proxy)
```
curl --request POST \
  --url http://localhost:3000/api/predict-proxy \
  -H "Content-Type: application/json" \
  -d '{"inputs":"Generate an IB Physics Paper 1 style multiple-choice question.","max_new_tokens":128}'
```

Security reminder
- Never expose `LIT_API_TOKEN` to client-side code. Use the proxy for browser-based clients.
- Rotate tokens immediately if accidentally leaked.
### v1.0.0
- Initial release with static question bank
- Basic MCQ and long-answer support
- Simple topic categorization