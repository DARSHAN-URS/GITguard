const logger = require('../utils/logger');

/**
 * Service to handle LLM interactions with strict JSON formatting and deterministic risk scoring.
 */
class LLMService {
    constructor() {
        this.modelName = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    }

    /**
     * Calculates deterministic risk score based on issues
     * High security issue → +40
     * High bug → +30
     * Medium performance → +15
     * Low quality → +5
     */
    calculateRiskScore(issues) {
        if (!issues || issues.length === 0) return 0;

        let totalScore = 0;
        issues.forEach(issue => {
            const severity = (issue.severity || '').toLowerCase();
            const category = (issue.category || '').toLowerCase();

            if (category === 'security' && severity === 'high') totalScore += 40;
            else if (category === 'bug' && severity === 'high') totalScore += 30;
            else if (category === 'performance' && severity === 'medium') totalScore += 15;
            else if (category === 'quality' && severity === 'low') totalScore += 5;
            else {
                // Fallback for other combinations
                if (severity === 'high') totalScore += 20;
                else if (severity === 'medium') totalScore += 10;
                else totalScore += 5;
            }
        });

        return Math.min(totalScore, 100);
    }

    async analyzeDiff(prompt, retryCount = 1) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error('GROQ_API_KEY not found');

        const systemPrompt = `You are a senior MERN architect. Analyze the code diff and return STRICT JSON.
NO markdown, NO preamble.

Required JSON structure:
{
  "summary": "...",
  "risk_score": number,
  "issues": [
    {
      "file": "...",
      "category": "bug|security|performance|quality",
      "severity": "low|medium|high",
      "description": "...",
      "current_code": "...",
      "suggested_fix": "..."
    }
  ]
}`;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                throw new Error(`LLM API Error: ${response.status} ${await response.text()}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            try {
                const parsed = JSON.parse(content);

                // Recalculate risk score deterministically
                parsed.risk_score = this.calculateRiskScore(parsed.issues);

                return {
                    ...parsed,
                    usage: {
                        promptTokens: data.usage?.prompt_tokens || 0,
                        completionTokens: data.usage?.completion_tokens || 0,
                        totalTokens: data.usage?.total_tokens || 0
                    }
                };
            } catch (parseError) {
                if (retryCount > 0) {
                    logger.warn('Invalid JSON from LLM, retrying...', { retryCount });
                    return this.analyzeDiff(prompt, retryCount - 1);
                }
                logger.error('STRICT JSON parsing failed after retry', { content });
                throw new Error('Failed to parse structured JSON from LLM');
            }
        } catch (error) {
            logger.error('LLM Service Error', { error: error.message });
            throw error;
        }
    }
}

module.exports = new LLMService();
