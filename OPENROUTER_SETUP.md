# OpenRouter Integration Guide

This guide explains how to get a free OpenRouter API key and use DeepSeek Chat v3.1 for question refinement in the IB Physics Question Generator.

## What is OpenRouter?

OpenRouter is a unified API for AI models that provides access to various LLMs including free models. For this project, we use **DeepSeek Chat v3.1:free**, which is a high-quality model available at no cost.

## Why Use OpenRouter?

- **Free Access**: DeepSeek Chat v3.1:free provides excellent question refinement without cost
- **Alternative to Gemini**: Reduces dependency on Google's API and provides backup refinement capability
- **High Quality**: DeepSeek models are known for strong reasoning and text generation
- **Same Prompts**: Uses the exact same prompts as Gemini for consistent output format

## Getting a Free OpenRouter API Key

### Step 1: Create an Account

1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Click "Sign In" or "Get Started"
3. Create an account using:
   - Email and password, OR
   - GitHub account, OR
   - Google account

### Step 2: Generate API Key

1. After signing in, go to your [API Keys page](https://openrouter.ai/keys)
2. Click "Create Key"
3. Give your key a descriptive name (e.g., "IB Physics Generator")
4. Set appropriate permissions (the default "Full Access" is fine for this use case)
5. Click "Create Key"
6. **Important**: Copy the API key immediately - you won't be able to see it again!

### Step 3: Verify Your Key

Your OpenRouter API key should:
- Start with `sk-or-`
- Be approximately 48-64 characters long
- Look like: `sk-or-1234567890abcdef...`

## Using OpenRouter with IB Physics Generator

### Option 1: Settings Panel (Recommended)

1. Start the application: `npm run dev`
2. Navigate to [http://localhost:3000/settings](http://localhost:3000/settings)
3. Enter your OpenRouter API key in the "OpenRouter API Key" field
4. Select "OpenRouter (DeepSeek Chat v3.1 Free)" as your refinement provider
5. Click "Save settings"

### Option 2: Environment Variables

Add to your `.env.local` file:

```env
OPENROUTER_API_KEY=sk-or-your-api-key-here
REFINEMENT_PROVIDER=openrouter
```

### Option 3: Request Body (For API calls)

Include in your POST request to `/api/generate-question`:

```json
{
  "topic": "kinematics",
  "difficulty": "standard",
  "type": "multiple-choice",
  "openRouterApiKey": "sk-or-your-api-key-here",
  "refinementProvider": "openrouter"
}
```

## Configuration Options

### Refinement Provider Selection

You can choose between two refinement providers:

1. **Google Gemini** (default)
   - Model: `gemini-2.5-flash` or `gemini-2.5-pro`
   - Requires: Google API key

2. **OpenRouter DeepSeek** (new option)
   - Model: `deepseek/deepseek-chat-v3.1:free`
   - Requires: OpenRouter API key

### Automatic Fallback

The system automatically handles fallbacks:

1. If your selected provider fails, it will use the other provider (if configured)
2. If both providers fail, it will return the original Llama-generated question
3. Error messages will indicate which provider was attempted

## Model Comparison

| Feature | Gemini 2.5 Flash | DeepSeek Chat v3.1:free |
|---------|------------------|-------------------------|
| **Cost** | ~$0.075/1M tokens | Free |
| **Speed** | Very fast | Fast |
| **Quality** | Excellent | Excellent |
| **Rate Limits** | Generous | Generous |
| **Physics Knowledge** | Strong | Strong |
| **IB Curriculum** | Good | Good |

## Troubleshooting

### Common Issues

**Invalid API Key Error**
- Ensure your key starts with `sk-or-`
- Check that you copied the full key without spaces
- Verify the key hasn't expired in your OpenRouter dashboard

**Rate Limit Exceeded**
- OpenRouter free tier has generous limits, but they exist
- Wait a few minutes and try again
- Consider upgrading your OpenRouter account if needed

**Provider Not Available**
- Check your internet connection
- Verify OpenRouter service status at [status.openrouter.ai](https://status.openrouter.ai)
- Try switching to Gemini provider temporarily

**Poor Question Quality**
- The same prompts are used for both providers
- Quality should be similar between Gemini and DeepSeek
- Report issues with specific examples for debugging

### Debug Information

Enable debug logging by checking the browser console or server logs. Look for:

```
[OpenRouterRefinement] Calling deepseek/deepseek-chat-v3.1:free (attempt 1)
[OpenRouterRefinement] Received response from deepseek/deepseek-chat-v3.1:free (1234 characters)
```

### Health Check

Test your configuration:

```bash
curl "http://localhost:3000/api/generate-question?action=health"
```

Response should show:
```json
{
  "overall": "healthy",
  "services": {
    "llama": "healthy",
    "refinement": "healthy",
    "validation": "healthy"
  }
}
```

## Advanced Configuration

### Environment Variables

```env
# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-your-key-here
REFINEMENT_PROVIDER=openrouter

# Optional: Override model (not recommended)
# OPENROUTER_MODEL=deepseek/deepseek-chat-v3.1:free

# Optional: Timeout and retry settings
# OPENROUTER_TIMEOUT_MS=30000
# OPENROUTER_MAX_RETRIES=3
```

### Custom Model Selection

While not recommended (as it may affect prompt compatibility), you can use other OpenRouter models by modifying the configuration:

```typescript
// In your custom configuration
const customConfig = createOpenRouterConfig(apiKey);
customConfig.model = 'anthropic/claude-3-haiku'; // Example alternative
```

**Note**: Only use models that support the same prompt format as DeepSeek for best results.

## Cost Information

### DeepSeek Chat v3.1:free
- **Input**: $0.00 per 1M tokens
- **Output**: $0.00 per 1M tokens
- **Daily Limits**: Generous (typically 100+ requests/day)
- **Rate Limits**: ~1 request/second

### Fair Usage
While the model is free, please:
- Don't spam requests unnecessarily
- Implement reasonable rate limiting in production
- Consider upgrading to paid tiers for high-volume usage

## Production Deployment

### Environment Variables for Production

```env
# Use both providers for redundancy
GOOGLE_API_KEY=your-gemini-key
OPENROUTER_API_KEY=sk-or-your-openrouter-key
REFINEMENT_PROVIDER=gemini  # Primary provider
ENABLE_REFINEMENT=true
FALLBACK_TO_ORIGINAL=true
```

### Load Balancing

For high-volume applications, consider:
1. Rotating between providers
2. Using different providers for different question types
3. Implementing circuit breakers for failed providers

## Support

If you encounter issues:

1. Check the [OpenRouter documentation](https://openrouter.ai/docs)
2. Review server logs for detailed error messages
3. Test with both providers to isolate the issue
4. Open an issue in the project repository with:
   - Error messages
   - Configuration (without API keys)
   - Steps to reproduce

## Security Notes

⚠️ **Important Security Reminders**:

- Never commit API keys to version control
- Use environment variables or secure settings files
- Rotate keys periodically
- Monitor usage in OpenRouter dashboard
- Set up billing alerts if using paid models

## Summary

OpenRouter with DeepSeek Chat v3.1:free provides:
- ✅ Free question refinement
- ✅ High quality output
- ✅ Easy setup process
- ✅ Reliable alternative to Gemini
- ✅ Same prompt compatibility

This integration makes the IB Physics Question Generator more accessible and provides redundancy for critical question generation workflows.