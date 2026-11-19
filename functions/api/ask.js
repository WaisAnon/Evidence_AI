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

    if (!context.env.GEMINI_API_KEY) {
      return reply(
        {
          error: "The AI key has not been configured."
        },
        500
      );
    }

    const prompt = `
You are Evidence AI, an evidence-based public-source research assistant.

Answer concisely in no more than 400 words.

Clearly separate:
- Confirmed facts
- Official allegations
- Credible reporting
- Disputed or unverified claims

Never present an unverified conspiracy claim as fact.
Never treat a criminal charge as a conviction.
Do not provide stolen personal data, passwords, credentials,
malware, or instructions for unauthorized access.

If live sources have not been provided, clearly state that this is a
preliminary background assessment and may not include recent developments.

Use these headings:

Assessment
Confirmed facts
Alleged or disputed
Unverified
Reliability
Sources to check

Question:
${question}
`;

    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 60000);

    let response;

    try {
      response = await fetch(endpoint, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": context.env.GEMINI_API_KEY
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
            thinkingConfig: {
              thinkingLevel: "low"
            }
          }
        }),

        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") {
        return reply(
          {
            error:
              "Gemini did not respond within 60 seconds. Please try again."
          },
          504
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const result = await response.json();

    if (!response.ok) {
      const safeError =
        result.error?.message || "Unknown Gemini API error.";

      return reply(
        {
          error: `Gemini error ${response.status}: ${safeError}`
        },
        502
      );
    }

    const answer =
      result.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought && part.text)
        .map((part) => part.text)
        .join("\n")
        .trim();

    if (!answer) {
      const finishReason =
        result.candidates?.[0]?.finishReason || "unknown";

      return reply(
        {
          error:
            `Gemini returned no readable answer. Finish reason: ${finishReason}.`
        },
        502
      );
    }

    return reply({ answer });
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
