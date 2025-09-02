# 🚀 API Guide for IB Physics Students & Educators

Hey there! Welcome to the API documentation for the IB Physics Practice Generator. Whether you're a curious student wanting to build your own physics app, an educator looking to integrate AI-generated questions into your teaching tools, or just someone excited about educational AI, this guide will help you get started.

## What Can You Build?

With this API, you can create:
- **Study apps** that generate personalized practice questions
- **Classroom tools** for teachers to quickly create assessments
- **Learning platforms** that adapt to student needs
- **Research projects** exploring AI in education

## Getting Started (The Simple Way)

Don't worry about complex setups! The API works right out of the box:

```
http://localhost:3000/api
```

## Do I Need API Keys?

Nope! You can start experimenting immediately without any keys. The system will use demo questions so you can learn how everything works. When you're ready to generate unlimited new questions, you can add:

- **OpenRouter API Key** (free!) - For AI question refinement
- **Lightning AI Token** - For advanced model hosting
- **Hugging Face Token** - For alternative AI models

## 🎯 Your First API Call

### Generate a Physics Question

Let's create your first IB Physics question! This is the main endpoint you'll use.

**How to call it:** `POST /api/generate-question`

**What to send:**

```json
{
  "topic": "kinematics",
  "difficulty": "standard",
  "type": "multiple-choice",
  "openRouterApiKey": "your-openrouter-api-key"
}
```

**What each part means:**

| What | Type | Required? | What it does |
|------|------|-----------|-------------|
| `topic` | text | Yes | Pick any IB Physics topic (see the full list below!) |
| `difficulty` | text | No | "standard" or "higher" - matches your IB level |
| `type` | text | No | "multiple-choice" (Paper 1) or "long-answer" (Paper 2) |
| `openRouterApiKey` | text | No | Your free OpenRouter key for better questions |

**All the IB Physics Topics You Can Use:**

These cover the entire IB Physics curriculum - pick any one that interests you!

- `kinematics`
- `forces_momentum`
- `work_energy_power`
- `wave_model`
- `electric_circuits`
- `electric_magnetic_fields`
- `gravitational_fields`
- `nuclear_physics`
- `thermal_energy_transfers`
- `gas_laws`
- `thermodynamics`
- `simple_harmonic_motion`
- `wave_phenomena`
- `standing_waves_resonance`
- `quantum_physics`
- `structure_atom`
- `radioactive_decay`
- `fission`
- `fusion_stars`
- `motion_electromagnetic_fields`
- `induction`
- `current_circuits`
- `greenhouse_effect`
- `rigid_body_mechanics`
- `galilean_special_relativity`
- `doppler_effect`

**🎉 What You'll Get Back (Success):**

When everything works, you'll receive a complete physics question with solution!

```json
{
  "success": true,
  "question": {
    "topic": "kinematics",
    "questionText": "A car accelerates uniformly from rest to a speed of 20 m/s in 10 s. What is the acceleration of the car?",
    "options": ["2 m/s²", "20 m/s²", "200 m/s²", "0.2 m/s²"],
    "correctAnswer": "A",
    "explanation": "Using v = u + at: 20 = 0 + a × 10 → a = 2 m/s²",
    "metadata": {
      "modelVersions": {
        "llama": "llama-3.1-8b-instruct",
        "openrouter": "deepseek-chat-v3.1:free"
      },
      "refinementApplied": true,
      "generatedAt": "2024-01-15T10:30:00Z"
    }
  },
  "formatted": {
    "type": "mcq",
    "topic": "Kinematics",
    "question": "A car accelerates uniformly from rest to a speed of 20 m/s in 10 s. What is the acceleration of the car?",
    "options": ["2 m/s²", "20 m/s²", "200 m/s²", "0.2 m/s²"],
    "correct": 0,
    "explanation": ["Using v = u + at: 20 = 0 + a × 10 → a = 2 m/s²"],
    "theory": "Topic: Kinematics - Uniform acceleration problems"
  }
}
```

**😢 If Something Goes Wrong:**

Don't worry! Here's what error messages mean and how to fix them:

```json
{
  "error": "OpenRouter API key is required. Please provide your OpenRouter API key in the settings.",
  "code": "MISSING_API_KEY"
}
```

**Common Issues & Quick Fixes:**

- `MISSING_API_KEY`: You need an OpenRouter key - get one free at [openrouter.ai](https://openrouter.ai)
- `INVALID_REQUEST`: Check your topic spelling or parameters
- `RATE_LIMITED`: You're asking too fast! Wait a moment and try again
- `TIMEOUT`: The AI is thinking hard - try again in a few seconds
- `GENERATION_FAILED`: Sometimes AI has bad days - just retry!

### 📊 Check if Everything's Working

Want to make sure the API is running? Use this simple health check.

**Quick check:** `GET /api/generate-question?action=health`

**You'll get:** Status of all the AI services

```json
{
  "status": "healthy",
  "services": {
    "llama": "available",
    "openrouter": "available",
    "validation": "ready"
  },
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Service Statistics

Get detailed statistics about service usage and performance.

**Endpoint:** `GET /api/generate-question?action=stats`

**Response:**

```json
{
  "orchestrator": {
    "totalRequests": 150,
    "successfulRequests": 145,
    "failedRequests": 5,
    "averageProcessingTime": 1250
  },
  "rateLimiting": {
    "openrouter": {
      "requestsThisHour": 45,
      "limitPerHour": 100
    },
    "huggingface": {
      "requestsThisHour": 23,
      "limitPerHour": 50
    }
  },
  "costs": {
    "openrouter": {
      "totalCost": 0.0000,
      "costThisMonth": 0.0000,
      "averageCostPerRequest": 0.000000
    }
  }
}
```

### Available Topics

Get the list of all available IB Physics topics.

**Endpoint:** `GET /api/generate-question?action=topics`

**Response:**

```json
{
  "topics": [
    {
      "id": "kinematics",
      "name": "Kinematics",
      "category": "Space, time and motion"
    },
    {
      "id": "forces_momentum",
      "name": "Forces and Momentum",
      "category": "Space, time and motion"
    }
    // ... more topics
  ]
}
```

### Settings Management

Manage application settings and API credentials.

**Endpoint:** `GET /api/settings`

**Response:**

```json
{
  "litUrl": "https://****.cloudspaces.litng.ai/predict",
  "litToken": "****-****-****-****",
  "huggingfaceApiKey": "****-****-****-****",
  "openRouterApiKey": "****-****-****-****",
  "llamaModelId": "d4ydy/ib-physics-question-generator",
  "useOwnerCredits": false
}
```

**Endpoint:** `POST /api/settings`

**Request Body:**

```json
{
  "litUrl": "https://your-endpoint.cloudspaces.litng.ai/predict",
  "litToken": "your-api-token",
  "huggingfaceApiKey": "your-hf-token",
  "openRouterApiKey": "your-openrouter-key",
  "llamaModelId": "model-id",
  "useOwnerCredits": false
}
```

### Predict Proxy

Proxy endpoint for Lightning AI predictions (keeps tokens server-side).

**Endpoint:** `POST /api/predict-proxy`

**Request Body:**

```json
{
  "inputs": "Generate an IB Physics Paper 1 style multiple-choice question.",
  "max_new_tokens": 128,
  "temperature": 0.7
}
```

**Response:**

```json
{
  "generated_text": "A car accelerates uniformly from rest to 20 m/s in 10 seconds. What is its acceleration?\n\nA) 2 m/s²\nB) 20 m/s²\nC) 200 m/s²\nD) 0.2 m/s²\n\nAnswer: A) 2 m/s²"
}
```

### Admin Reload

Reload services and configurations (admin endpoint).

**Endpoint:** `POST /api/admin/reload`

**Request Body:**

```json
{
  "openRouterApiKey": "new-api-key"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Services reloaded successfully"
}
```

## Rate Limiting

The API includes built-in rate limiting to prevent abuse:

- **OpenRouter API**: 100 requests per hour
- **Hugging Face API**: 50 requests per hour
- **Global limit**: 200 requests per hour per IP

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Error Handling

All API errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": "Additional error details (optional)",
  "retryAfter": 60
}
```

## SDKs and Libraries

### JavaScript/Node.js

```javascript
const generateQuestion = async (topic, difficulty = 'standard', type = 'multiple-choice') => {
  const response = await fetch('/api/generate-question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      difficulty,
      type,
      openRouterApiKey: 'your-api-key' // optional
    })
  });

  const data = await response.json();
  return data;
};

// Usage
const question = await generateQuestion('kinematics', 'standard', 'multiple-choice');
console.log(question.question.questionText);
```

### Python

```python
import requests
import json

def generate_question(topic, difficulty='standard', type='multiple-choice', api_key=None):
    url = "http://localhost:3000/api/generate-question"
    payload = {
        "topic": topic,
        "difficulty": difficulty,
        "type": type
    }

    if api_key:
        payload["openRouterApiKey"] = api_key

    response = requests.post(url, json=payload)
    return response.json()

# Usage
question = generate_question('kinematics')
print(question['question']['questionText'])
```

### cURL Examples

```bash
# Generate a multiple-choice question
curl -X POST "http://localhost:3000/api/generate-question" \
  -H "Content-Type: application/json" \
  -d '{"topic":"kinematics","difficulty":"standard","type":"multiple-choice"}'

# Generate a long-answer question
curl -X POST "http://localhost:3000/api/generate-question" \
  -H "Content-Type: application/json" \
  -d '{"topic":"electric_circuits","difficulty":"higher","type":"long-answer"}'

# Health check
curl "http://localhost:3000/api/generate-question?action=health"

# Get available topics
curl "http://localhost:3000/api/generate-question?action=topics"
```

## Webhooks

The API supports webhooks for real-time notifications (planned feature):

```json
{
  "event": "question.generated",
  "data": {
    "questionId": "q_123456",
    "topic": "kinematics",
    "processingTime": 1250,
    "cost": 0.000156
  }
}
```

## Best Practices

### Error Handling

```javascript
try {
  const response = await fetch('/api/generate-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'kinematics' })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();
  console.log('Generated question:', data.question);
} catch (error) {
  console.error('Failed to generate question:', error.message);
}
```

### Rate Limiting

- Implement exponential backoff for retries
- Cache frequently requested questions
- Monitor your usage with the stats endpoint

### Security

- Never expose API keys in client-side code
- Use HTTPS in production
- Implement proper CORS policies
- Validate all input parameters

## Troubleshooting

### Common Issues

**"OpenRouter API key is required"**
- Provide a valid OpenRouter API key in the request or environment

**"Rate limit exceeded"**
- Wait for the rate limit to reset or upgrade your plan
- Check the `X-RateLimit-Reset` header for reset time

**"Service temporarily unavailable"**
- The service may be experiencing high load
- Try again in a few minutes

**"Invalid topic"**
- Use only topics from the available topics list
- Check topic spelling and format

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=ib-physics:* npm run dev
```

## Changelog

### v1.0.0
- Initial release with complete IB Physics question generation
- AI-powered generation using fine-tuned Llama 3.1 8B and OpenRouter DeepSeek
- Multiple AI provider support (Lightning AI, Hugging Face, OpenRouter, local models)
- Question types: Multiple-choice (Paper 1) and long-answer (Paper 2)
- Complete IB Physics curriculum coverage with 25 subtopics
- Modern responsive web interface with real-time generation
- Settings management API and UI
- Rate limiting and cost tracking
- Comprehensive validation engine
- Demo mode and self-hosting support
- RESTful API with health checks and monitoring

## Support

- **Documentation**: [GitHub Repository](https://github.com/melonwer/ibphysiq)
- **Issues**: [GitHub Issues](https://github.com/melonwer/ibphysiq/issues)
- **Discussions**: [GitHub Discussions](https://github.com/melonwer/ibphysiq/discussions)

---

<p align="center">Made with ❤️ for the IB Physics community</p>