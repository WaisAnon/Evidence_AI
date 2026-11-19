export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);

    const protectedRoutes = {
      "/api/ask": "general",
      "/api/ask-doj": "doj"
    };

    const researchMode = protectedRoutes[url.pathname];

    /*
      Allow all ordinary website pages and unprotected API routes.
    */

    if (!researchMode) {
      return context.next();
    }

    /*
      If the KV binding is temporarily unavailable,
      keep the website working rather than blocking users.
    */

    if (!context.env.RATE_LIMIT) {
      console.log("RATE_LIMIT KV binding is unavailable.");
      return context.next();
    }

    const clientIp =
      context.request.headers.get("CF-Connecting-IP") ||
      "unknown";

    const userAgent =
      context.request.headers.get("User-Agent") ||
      "unknown";

    /*
      Create an anonymous identifier.
      The plain IP address is not stored in KV.
    */

    const anonymousId = await createAnonymousId(
      `${clientIp}:${userAgent}`
    );

    const currentHour =
      Math.floor(Date.now() / 3600000);

    /*
      General AI and DOJ searches use separate counters.
    */

    const key =
      `${researchMode}:${anonymousId}:${currentHour}`;

    const storedValue =
      await context.env.RATE_LIMIT.get(key);

    const currentCount =
      Number(storedValue || "0");

    const hourlyLimit = 10;

    if (currentCount >= hourlyLimit) {
      return sendLimitResponse({
        currentHour,
        researchMode,
        hourlyLimit,
        currentCount
      });
    }

    const newCount = currentCount + 1;

    /*
      Keep the temporary counter for two hours.
      The key itself changes every hour.
    */

    await context.env.RATE_LIMIT.put(
      key,
      String(newCount),
      {
        expirationTtl: 7200
      }
    );

    const response = await context.next();

    const updatedResponse = new Response(
      response.body,
      response
    );

    updatedResponse.headers.set(
      "X-RateLimit-Limit",
      String(hourlyLimit)
    );

    updatedResponse.headers.set(
      "X-RateLimit-Remaining",
      String(
        Math.max(0, hourlyLimit - newCount)
      )
    );

    updatedResponse.headers.set(
      "X-RateLimit-Reset",
      String(getResetTimestamp(currentHour))
    );

    return updatedResponse;
  } catch (error) {
    console.error(
      "Rate-limit middleware failed:",
      error
    );

    /*
      Fail open if the limiter encounters an unexpected error.
      This prevents a temporary KV problem from disabling the website.
    */

    return context.next();
  }
}

async function createAnonymousId(value) {
  const encoded =
    new TextEncoder().encode(value);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join("")
    .slice(0, 32);
}

function getResetTimestamp(currentHour) {
  return (currentHour + 1) * 3600;
}

function sendLimitResponse({
  currentHour,
  researchMode,
  hourlyLimit,
  currentCount
}) {
  return new Response(
    JSON.stringify({
      error:
        "You have reached the hourly limit for this research mode. Please try again after the current hour.",
      limit: hourlyLimit,
      used: currentCount,
      remaining: 0,
      researchMode
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-RateLimit-Limit":
          String(hourlyLimit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset":
          String(
            getResetTimestamp(currentHour)
          )
      }
    }
  );
}
