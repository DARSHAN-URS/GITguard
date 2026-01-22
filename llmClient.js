const logger = require('./logger');

/**
 * LLM Client for sending prompts to Groq (Llama 3)
 * Supports: Groq with active Llama models
 */

/**
 * Sends prompt to Groq (Llama)
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - Groq API key
 * @returns {Promise<Object>} - LLM response
 */
async function sendToGroq(prompt, apiKey) {
  try {
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    // ✅ Use a NON-deprecated Groq model
    const modelName = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    logger.debug('Calling Groq API', {
      model: modelName
    });

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
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 1
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices.length) {
      throw new Error('Groq API returned no choices');
    }

    return {
      provider: 'groq',
      model: data.model || modelName,
      response: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }
    };
  } catch (error) {
    logger.error('Error calling Groq API', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sends prompt to Groq LLM
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - Groq API key
 * @returns {Promise<Object>} - LLM response with metadata
 */
async function sendToLLM(prompt, apiKey) {
  const startTime = Date.now();

  try {
    logger.info('🤖 Sending prompt to Groq LLM', {
      promptLength: prompt.length
    });

    const result = await sendToGroq(prompt, apiKey);

    const processingTime = Date.now() - startTime;

    logger.info('✅ LLM response received', {
      provider: result.provider,
      model: result.model,
      responseLength: result.response.length,
      tokensUsed: result.usage.totalTokens,
      processingTimeMs: processingTime
    });

    return {
      ...result,
      processingTimeMs: processingTime,
      receivedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error sending to LLM', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  sendToLLM,
  sendToGroq
};
