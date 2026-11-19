export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (question.length < 10 || question.length > 1000) {
      return reply(
        {
          error:
            "Enter a valid question between 10 and 1,000 characters."
        },
        400
      );
    }

    if (
      !context.env.GROQ_API_KEY &&
      !context.env.GEMINI_API_KEY
    ) {
      return reply(
        {
          error: "No AI provider has been configured."
        },
        500
      );
    }

    let groqFailure = null;
You are Evidence AI, an evidence-based public-source research assistant.

Answer concisely in no more than 400 words.

Clearly distinguish:
- Confirmed facts
- Official allegations
- Credible reporting
- Disputed or unverified claims

Never present an unverified conspiracy claim as established fact.
Never treat a criminal charge as a conviction.
Do not provide stolen personal data, passwords, credentials,
malware, or instructions for unauthorized access.

If live source material has not been supplied, clearly state that
the response is a preliminary background assessment and may not
include recent developments.

Use exactly these headings:

Assessment
Confirmed facts
Alleged or disputed
Unverified
Reliability
Sources to check

Question:
${question}
`;

    /*
      PRIMARY PROVIDER: GROQ
    */

    if (context.env.GROQ_API_KEY) {
      const groqResult = await askGroq(
        prompt,
        context.env.GROQ_API_KEY
      );

      if (groqResult.success) {
        return reply({
          answer: groqResult.answer,
          provider: "GroqCloud"
        });
      }

groqFailure = groqResult;

console.log(
  `Groq failed: ${groqResult.status} ${groqResult.error}`
);
    }

    /*
      BACKUP PROVIDER: GEMINI
    */

    if (context.env.GEMINI_API_KEY) {
      const geminiResult = await askGemini(
        prompt,
        context.env.GEMINI_API_KEY
      );

      if (geminiResult.success) {
        return reply({
          answer: geminiResult.answer,
          provider: "Google Gemini"
        });
      }

      console.log(
        `Gemini failed: ${geminiResult.status} ${geminiResult.error}`
      );

      return reply(
        return reply(
  {
    error:
      `Groq error ${groqFailure?.status || "unknown"}: ` +
      `${groqFailure?.error || "Unknown Groq error"}. ` +
      `Gemini returned ${geminiResult.status}.`
  },
  503
);
    }

    return reply(
      {
        error:
          "The primary AI provider is temporarily unavailable."
      },
      503
    );
  } catch (error) {
    console.error(error);

    return reply(
      {
        error: "Unable to process the request."
      },
      500
    );
  }
}

async function askGroq(prompt, apiKey) {
  const endpoint =
    "https://api.groq.com/openai/v1/chat/completions";

  const result = await timedFetch(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content:
              "Follow the evidence-assessment instructions carefully."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_completion_tokens: 800
      })
    },
    20000
  );

  if (!result.response) {
    return {
      success: false,
      status: result.timedOut ? 504 : 500,
      error: result.error || "Groq request failed."
    };
  }

  const data = await safeJson(result.response);

  if (!result.response.ok) {
    return {
      success: false,
      status: result.response.status,
      error:
        data.error?.message || "Unknown Groq API error."
    };
  }

  const answer =
    data.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    return {
      success: false,
      status: 502,
      error: "Groq returned no readable answer."
    };
  }

  return {
    success: true,
    status: 200,
    answer
  };
}

async function askGemini(prompt, apiKey) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

  const result = await timedFetch(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 800,
          thinkingConfig: {
            thinkingLevel: "low"
          }
        }
      })
    },
    45000
  );

  if (!result.response) {
    return {
      success: false,
      status: result.timedOut ? 504 : 500,
      error: result.error || "Gemini request failed."
    };
  }

  const data = await safeJson(result.response);

  if (!result.response.ok) {
    return {
      success: false,
      status: result.response.status,
      error:
        data.error?.message || "Unknown Gemini API error."
    };
  }

  const answer =
    data.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought && part.text)
      .map((part) => part.text)
      .join("\n")
      .trim();

  if (!answer) {
    return {
      success: false,
      status: 502,
      error: "Gemini returned no readable answer."
    };
  }

  return {
    success: true,
    status: 200,
    answer
  };
}

async function timedFetch(url, options, milliseconds) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, milliseconds);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    return {
      response,
      timedOut: false
    };
  } catch (error) {
    return {
      response: null,
      timedOut: error.name === "AbortError",
      error:
        error.name === "AbortError"
          ? "The request timed out."
          : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
