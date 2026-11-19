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

Separate confirmed facts, official allegations, credible reporting,
reasonable inference, and speculation.

Never treat a criminal charge as a conviction.
Never present an unverified conspiracy claim as established fact.
Do not provide stolen personal data, credentials, malware,
or instructions for unauthorized access.

Keep the response concise and under 600 words.

If live source material has not been provided, clearly state that the
answer is a preliminary background assessment and may not reflect
recent developments.

Use exactly these headings:

Assessment
What is confirmed
What is alleged or disputed
What remains unverified
Reliability
Sources to check

Question:
${question}
`;

    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/interactions";

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

    let response;

    try {
      response = await fetch(endpoint, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": context.env.GEMINI_API_KEY,
          "Api-Revision": "2026-05-20"
        },

        body: JSON.stringify({
          model: "gemini-3.8-flash",
          input: prompt,
          generation_config: {
            thinking_level: "low"
          }
        }),

        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") {
        return reply(
          {
            error:
              "The AI took longer than 55 seconds. Please try again."
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

    const answer = (result.steps || [])
      .filter((step) => step.type === "model_output")
      .flatMap((step) => step.content || [])
      .filter((item) => item.type === "text")
      .map((item) => item.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      return reply(
        {
          error:
            "The AI completed the request but returned no readable answer."
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
