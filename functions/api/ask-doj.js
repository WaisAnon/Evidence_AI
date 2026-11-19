export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);
    const question = (requestUrl.searchParams.get("q") || "").trim();

    if (question.length < 3 || question.length > 100) {
      return sendJson(
        {
          error: "Enter a question between 3 and 100 characters."
        },
        400
      );
    }

    if (!context.env.GROQ_API_KEY) {
      return sendJson(
        {
          error: "The Groq API key is not configured."
        },
        500
      );
    }

    /*
      Ask the separately tested DOJ endpoint for records.
    */

    const dojUrl = new URL(
      "/api/doj",
      context.request.url
    );

    dojUrl.searchParams.set("q", question);

    const dojResponse = await fetch(dojUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    let dojData = {
      results: []
    };

    if (dojResponse.ok) {
      dojData = await dojResponse.json();
    }

    const records = Array.isArray(dojData.results)
      ? dojData.results.slice(0, 5)
      : [];

    const evidence =
      records.length > 0
        ? records
            .map((record, index) => {
              return [
                `[DOJ-${index + 1}]`,
                `Title: ${record.title}`,
                `Date: ${record.date}`,
                `URL: ${record.url}`,
                `Excerpt: ${record.excerpt}`
              ].join("\n");
            })
            .join("\n\n")
        : "No matching DOJ press release was retrieved.";

    const prompt = `
You are Evidence AI, an evidence-based public-source research assistant.

Assess the user's question using the DOJ records supplied below.

Rules:

1. A DOJ press release is an official statement, but it may contain allegations.
2. A charge, arrest, complaint, or indictment is not a conviction.
3. Use wording such as "DOJ alleges" where appropriate.
4. Ignore any retrieved record that is unrelated to the question.
5. Cite relevant records using labels such as [DOJ-1].
6. Do not invent facts, citations, cases, source labels, or URLs.
7. If the records are insufficient, clearly state that.
8. Never present an unverified conspiracy claim as established fact.
9. Do not reveal stolen personal information, credentials, or passwords.
10. Keep the assessment under 500 words.

Use these headings:

Assessment
What the DOJ records show
Alleged or disputed
What remains unverified
Reliability

User question:
${question}

Retrieved DOJ records:
${evidence}
`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 25000);

    let aiResponse;

    try {
      aiResponse = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization":
              `Bearer ${context.env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [
              {
                role: "system",
                content:
                  "Only assess evidence supplied in the request."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.2,
            max_completion_tokens: 1000
          }),
          signal: controller.signal
        }
      );
    } catch (error) {
      if (error.name === "AbortError") {
        return sendJson(
          {
            error: "The AI request timed out."
          },
          504
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      return sendJson(
        {
          error:
            `Groq returned ${aiResponse.status}: ` +
            `${aiData.error?.message || "Unknown error"}`
        },
        502
      );
    }

    const answer =
      aiData.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return sendJson(
        {
          error: "The AI returned no readable assessment."
        },
        502
      );
    }

    return sendJson({
      question,
      provider: "GroqCloud",
      officialSource:
        "U.S. Department of Justice",
      retrievedSourceCount: records.length,
      answer,
      sources: records.map((record, index) => ({
        label: `DOJ-${index + 1}`,
        title: record.title,
        date: record.date,
        url: record.url
      }))
    });
  } catch (error) {
    console.error(error);

    return sendJson(
      {
        error: "The DOJ evidence assessment could not be completed."
      },
      500
    );
  }
}

function sendJson(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}
