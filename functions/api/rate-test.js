export async function onRequestGet(context) {
  try {
    if (!context.env.RATE_LIMIT) {
      return sendJson(
        {
          error: "The RATE_LIMIT KV binding is unavailable."
        },
        500
      );
    }

    const clientIp =
      context.request.headers.get("CF-Connecting-IP") ||
      "unknown";

    const currentHour =
      Math.floor(Date.now() / 3600000);

    const anonymousId =
      await createAnonymousId(clientIp);

    const key =
      `test:${anonymousId}:${currentHour}`;

    const storedValue =
      await context.env.RATE_LIMIT.get(key);

    const currentCount =
      Number(storedValue || "0");

    const limit = 5;

    if (currentCount >= limit) {
      return sendJson(
        {
          allowed: false,
          error:
            "Hourly test limit reached. Please try again after the current hour.",
          limit,
          used: currentCount,
          remaining: 0
        },
        429
      );
    }

    const newCount =
      currentCount + 1;

    await context.env.RATE_LIMIT.put(
      key,
      String(newCount),
      {
        expirationTtl: 7200
      }
    );

    return sendJson({
      allowed: true,
      limit,
      used: newCount,
      remaining: Math.max(
        0,
        limit - newCount
      )
    });
  } catch (error) {
    console.error(error);

    return sendJson(
      {
        error:
          "The rate-limit test could not be completed."
      },
      500
    );
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
    .slice(0, 24);
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
