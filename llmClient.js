const logger = require('./logger');

/**
 * LLM Client for sending prompts to Groq (Llama 3)
 */

async function sendToGroq(prompt, apiKey) {
  try {
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const modelName = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    const systemPrompt = `You are an expert security researcher and code reviewer.
Analyze the provided code changes and return a JSON object with this exact structure:
{
  "summary": "High-level summary of changes and overall health",
  "risk_score": (number between 0-100),
  "issues": [
    {
      "file": "filename",
      "line": (number or null),
      "type": "Bug|Security|Performance|Quality|Best Practice",
      "severity": "Low|Medium|High|Critical",
      "title": "Short title",
      "message": "Detailed explanation",
      "suggestion": "How to fix it"
    }
  ]
}
Return ONLY valid JSON. No markdown formatting, no preamble, no postscript.`;

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1, // Lower temperature for more deterministic JSON
          max_tokens: 4096,
          response_format: { type: "json_object" } // Enforce JSON if supported by model
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      logger.error('Failed to parse LLM JSON response', { content });
      throw new Error('Invalid JSON response from LLM');
    }

    return {
      provider: 'groq',
      model: data.model || modelName,
      response: parsedContent,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }
    };
  } catch (error) {
    logger.error('Error calling Groq API', { error: error.message });
    throw error;
  }
}

/**
 * Calculates a deterministic risk score based on issues
 */
function calculateDeterministicRiskScore(issues) {
  if (!issues || issues.length === 0) return 0;

  const weights = {
    'Critical': 40,
    'High': 20,
    'Medium': 10,
    'Low': 5
  };

  let totalScore = 0;
  issues.forEach(issue => {
    totalScore += weights[issue.severity] || 5;
  });

  return Math.min(100, totalScore);
}

async function sendToLLM(prompt, apiKey) {
  const startTime = Date.now();

  try {
    const result = await sendToGroq(prompt, apiKey);
    const processingTime = Date.now() - startTime;

    // Apply deterministic risk scoring
    const backendRiskScore = calculateDeterministicRiskScore(result.response.issues);
    // Average with LLM score or prioritize backend? requirement #5 says "Implement deterministic risk scoring in backend"
    // We'll update the risk score in the response.
    result.response.risk_score = backendRiskScore;

    return {
      ...result,
      processingTimeMs: processingTime,
      receivedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error sending to LLM', { error: error.message });
    throw error;
  }
}

async function sendBatchToLLM(prompts, apiKey, options = {}) {
  const { delayBetweenCalls = 1000 } = options;
  const responses = [];

  for (let i = 0; i < prompts.length; i++) {
    const promptObj = prompts[i];
    try {
      const response = await sendToLLM(promptObj.prompt, apiKey);
      responses.push({
        ...response,
        filename: promptObj.filename
      });
      if (i < prompts.length - 1 && delayBetweenCalls > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
      }
    } catch (error) {
      responses.push({ error: error.message, filename: promptObj.filename, failed: true });
    }
  }
  return responses;
}

module.exports = {
  sendToLLM,
  sendToGroq,
  sendBatchToLLM
};
