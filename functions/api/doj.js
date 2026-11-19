export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);
    const query = (requestUrl.searchParams.get("q") || "").trim();

    if (query.length < 3 || query.length > 100) {
      return sendJson(
        {
          error: "Enter a search term between 3 and 100 characters."
        },
        400
      );
    }

    const dojUrl = new URL(
      "https://www.justice.gov/api/v1/press_releases.json"
    );

    dojUrl.searchParams.set("parameters[title]", query);
    dojUrl.searchParams.set("pagesize", "5");
    dojUrl.searchParams.set("sort", "date");
    dojUrl.searchParams.set("direction", "DESC");

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000);

    let response;

    try {
      response = await fetch(dojUrl.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "EvidenceAI/0.2"
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return sendJson(
        {
          error: `DOJ returned status ${response.status}.`
        },
        502
      );
    }

    const data = await response.json();

    const results = (data.results || [])
      .filter((item) => item.title && item.url)
      .slice(0, 5)
      .map((item) => ({
        title: cleanText(item.title),
        date: formatDate(item.date),
        url: normalizeUrl(item.url),
        excerpt: cleanText(
          item.teaser || item.body || ""
        ).slice(0, 500)
      }));

    return sendJson({
      query,
      source: "U.S. Department of Justice",
      resultCount: results.length,
      results
    });
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "The DOJ request timed out."
        : "The DOJ search could not be completed.";

    return sendJson(
      {
        error: message
      },
      500
    );
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp)) {
    return "Date unavailable";
  }

  const date = new Date(timestamp * 1000);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toISOString().slice(0, 10);
}

function normalizeUrl(value) {
  const url = String(value || "").trim();

  if (url.startsWith("/")) {
    return `https://www.justice.gov${url}`;
  }

  return url
    .replace(
      "http://www.justice.gov",
      "https://www.justice.gov"
    )
    .replace(
      "https://justice.gov",
      "https://www.justice.gov"
    );
}

function sendJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
