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
          error: "Enter a valid question between 10 and 1,000 characters."
        },
        400
      );
    }

    if (!context.env.GROQ_API_KEY && !context.env.GEMINI_API_KEY) {
      return reply(
        {
          error: "No AI provider has been configured."
        },
        500
      );
    }

    /*
      Search the official DOJ press-release API.
      If DOJ is unavailable, the AI can still answer.
    */

    const dojRecords = await searchDOJ(question);

    const dojEvidence =
      dojRecords.length > 0
        ? dojRecords
            .map((record, index) => {
              return `
[DOJ-${index + 1}]
Title: ${record.title}
Date: ${record.date}
URL: ${record.url}
Excerpt: ${record.excerpt}
`;
            })
            .join("\n")
        : "No relevant DOJ press release was retrieved for this question.";

    const prompt = `
You are Evidence AI, an evidence-based public-source research assistant.

Answer concisely in no more than 500 words.

Clearly distinguish:
- Confirmed facts
- Official allegations
- Credible reporting
- Disputed or unverified claims

Important evidence rules:

1. A DOJ press release is an official DOJ statement.
2. A charge, complaint, indictment, arrest, or allegation is not a conviction.
3. Use phrases such as "DOJ alleges" when the underlying matter has not
   resulted in a conviction or judicial finding.
4. Do not claim that DOJ records prove something they do not prove.
5. Ignore any retrieved DOJ record that is unrelated to the question.
6. Cite relevant DOJ records using labels such as [DOJ-1].
7. Do not invent source labels or URLs.
8. If no relevant live source was retrieved, say that the answer is a
   preliminary background assessment.
9. Never present an unverified conspiracy claim as established fact.
10. Do not provide stolen personal data, passwords, credentials, malware,
    or instructions for unauthorized access.

Use exactly these headings:

Assessment
Confirmed facts
Alleged or disputed
Unverified
Reliability
Sources

Official DOJ records retrieved:

${dojEvidence}

User question:

${question}
`;

    let groqFailure = null;

    /*
      PRIMARY AI: GROQ
    */

    if (context.env.GROQ_API_KEY) {
      const groqResult = await askGroq(
        prompt,
        context.env.GROQ_API_KEY
      );

      if (groqResult.success) {
        return reply({
          answer: groqResult.answer,
          provider: "GroqCloud",
          sources: dojRecords
        });
      }

      groqFailure = groqResult;

      console.log(
        `Groq failed: ${groqResult.status} ${groqResult.error}`
      );
    }

    /*
      BACKUP AI: GEMINI
    */

    if (context.env.GEMINI_API_KEY) {
      const geminiResult = await askGemini(
        prompt,
        context.env.GEMINI_API_KEY
      );

      if (geminiResult.success) {
        return reply({
          answer: geminiResult.answer,
          provider: "Google Gemini",
          sources: dojRecords
        });
      }

      console.log(
        `Gemini failed: ${geminiResult.status} ${geminiResult.error}`
      );

      return reply(
        {
          error:
            `Groq error ${groqFailure?.status || "unknown"}: ` +
            `${groqFailure?.error || "Unknown Groq error"}. ` +
            `Gemini returned ${geminiResult.status}: ` +
            `${geminiResult.error || "Unknown Gemini error"}.`
        },
        503
      );
    }

    return reply(
      {
        error:
          `Groq error ${groqFailure?.status || "unknown"}: ` +
          `${groqFailure?.error || "Unknown Groq error"}.`
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

/*
  DOJ SEARCH
*/

async function searchDOJ(question) {
  try {
    const keywords = extractKeywords(question);

    if (keywords.length === 0) {
      return [];
    }

    const collected = [];

    /*
      Search one keyword at a time.
      Limit searches to three to respect DOJ rate limits.
    */

    for (const keyword of keywords.slice(0, 3)) {
      const url = new URL(
        "https://www.justice.gov/api/v1/press_releases.json"
      );

      url.searchParams.set("parameters[title]", keyword);
      url.searchParams.set("pagesize", "10");
      url.searchParams.set("sort", "date");
      url.searchParams.set("direction", "DESC");

      const result = await timedFetch(
        url.toString(),
        {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "User-Agent": "EvidenceAI/0.2"
          }
        },
        8000
      );

      if (!result.response || !result.response.ok) {
        continue;
      }

      const data = await safeJson(result.response);

      for (const item of data.results || []) {
        if (!item.url || !item.title) {
          continue;
        }

        collected.push({
          title: cleanText(item.title),
          url: normalizeDOJUrl(item
