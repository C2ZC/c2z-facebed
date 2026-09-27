const FACEBOOK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`,
      "i"
    )
  ];

  for (const regex of patterns) {
    const match = html.match(regex);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function getCanonical(html) {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
  );

  return match?.[1]?.trim() || "";
}

function getTargetUrl(request) {
  const requestUrl = new URL(request.url);

  // Test format:
  // https://fb.c2z.top/?url=https://www.facebook.com/...
  const queryUrl = requestUrl.searchParams.get("url");

  if (queryUrl) {
    return queryUrl;
  }

  return null;
}

function page(title, description, image, canonical, status) {
  const safeTitle = escapeHtml(title || "C2Z Facebed");
  const safeDescription = escapeHtml(description || "");
  const safeImage = escapeHtml(image || "");
  const safeCanonical = escapeHtml(canonical || "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>${safeTitle}</title>

<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeCanonical}">
<meta property="og:type" content="article">

${safeImage ? `<meta property="og:image" content="${safeImage}">` : ""}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
${safeImage ? `<meta name="twitter:image" content="${safeImage}">` : ""}

</head>
<body>
<h1>C2Z Facebed</h1>

<p>Status: ${status}</p>

<p>Title: ${safeTitle}</p>

${safeDescription ? `<p>Description: ${safeDescription}</p>` : ""}

${safeImage ? `<p>Image: ${safeImage}</p>` : ""}

${safeCanonical ? `<p>Canonical: ${safeCanonical}</p>` : ""}
</body>
</html>`;
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    // Home page
    if (requestUrl.pathname === "/" && !requestUrl.searchParams.has("url")) {
      return new Response(
        "C2Z Facebed Worker\n\n" +
        "Usage:\n" +
        "https://fb.c2z.top/?url=FACEBOOK_URL",
        {
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    const targetUrl = getTargetUrl(request);

    if (!targetUrl) {
      return new Response(
        "Missing ?url= parameter",
        {
          status: 400,
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    let target;

    try {
      target = new URL(targetUrl);
    } catch {
      return new Response(
        "Invalid URL",
        {
          status: 400,
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    // Only allow Facebook for this test
    const hostname = target.hostname.toLowerCase();

    const isFacebook =
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com");

    if (!isFacebook) {
      return new Response(
        "Only Facebook URLs are supported.",
        {
          status: 403,
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    try {
      const facebookResponse = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": FACEBOOK_UA,
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9," +
            "image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache"
        }
      });

      const html = await facebookResponse.text();

      const title =
        getMeta(html, "og:title") ||
        getMeta(html, "twitter:title") ||
        "Facebook";

      const description =
        getMeta(html, "og:description") ||
        getMeta(html, "description") ||
        "";

      const image =
        getMeta(html, "og:image") ||
        getMeta(html, "twitter:image") ||
        "";

      const ogUrl =
        getMeta(html, "og:url") ||
        getCanonical(html) ||
        facebookResponse.url;

      console.log({
        requested: target.toString(),
        finalUrl: facebookResponse.url,
        status: facebookResponse.status,
        title,
        image,
        ogUrl
      });

      return new Response(
        page(
          title,
          description,
          image,
          ogUrl,
          `Facebook HTTP ${facebookResponse.status}`
        ),
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "cache-control": "public, max-age=60"
          }
        }
      );

    } catch (error) {
      return new Response(
        "Facebook request failed\n\n" +
        String(error),
        {
          status: 502,
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }
  }
};