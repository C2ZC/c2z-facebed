const FACEBOOK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/146.0.0.0 Safari/537.36";

const FACEBOOK_HEADERS = {
  "User-Agent": FACEBOOK_UA,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isFacebookUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com")
    );
  } catch {
    return false;
  }
}

function isSharePath(value) {
  try {
    const url = new URL(value);
    return /^\/share(?:\/|$)/i.test(url.pathname);
  } catch {
    return /^\/?share(?:\/|$)/i.test(value);
  }
}

function isLoginPath(value) {
  try {
    const url = new URL(value);
    return /^\/login(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function getMeta(html, property) {
  const escaped = property.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

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
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return "";
}

function getCanonical(html) {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return "";
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function makeAbsoluteUrl(value, baseUrl) {
  if (!value) return "";

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function looksLikePostUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();

    if (!isFacebookUrl(value)) {
      return false;
    }

    if (isSharePath(value) || isLoginPath(value)) {
      return false;
    }

    return (
      path.startsWith("/reel/") ||
      path.startsWith("/watch") ||
      path.includes("/videos/") ||
      path.includes("/posts/") ||
      path.includes("/permalink/") ||
      path.startsWith("/photo/")
    );
  } catch {
    return false;
  }
}

/*
 * Try to find a real Facebook target from HTML.
 * This follows the same basic idea as Facebed:
 *
 * canonical
 * og:url
 * final response URL
 */
function inspectFacebookPage(html, responseUrl) {
  const canonical = getCanonical(html);
  const ogUrl = getMeta(html, "og:url");

  const candidates = [
    makeAbsoluteUrl(canonical, responseUrl),
    makeAbsoluteUrl(ogUrl, responseUrl),
    responseUrl
  ].filter(Boolean);

  let selectedUrl = responseUrl;
  let declaredTarget = false;

  for (const candidate of candidates) {
    if (looksLikePostUrl(candidate)) {
      selectedUrl = candidate;
      declaredTarget = true;
      break;
    }
  }

  const title =
    getMeta(html, "og:title") ||
    getMeta(html, "twitter:title") ||
    getMeta(html, "title") ||
    "Facebook";

  const description =
    getMeta(html, "og:description") ||
    getMeta(html, "description") ||
    "";

  const image =
    getMeta(html, "og:image") ||
    getMeta(html, "twitter:image") ||
    "";

  return {
    selectedUrl,
    canonical,
    ogUrl,
    title,
    description,
    image,
    declaredTarget
  };
}

/*
 * Facebed-style share resolver
 */
async function resolveFacebookShare(sourceUrl) {
  let headResponse = null;

  /*
   * Step 1:
   * HEAD request
   */
  try {
    headResponse = await fetch(sourceUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": FACEBOOK_UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });
  } catch (error) {
    console.log("HEAD failed:", String(error));
  }

  if (headResponse) {
    const headUrl = headResponse.url;

    console.log("HEAD status:", headResponse.status);
    console.log("HEAD final URL:", headUrl);

    /*
     * If HEAD already resolved directly to a Reel/Post,
     * we can use it.
     */
    if (
      headResponse.status < 400 &&
      looksLikePostUrl(headUrl)
    ) {
      return {
        sourceUrl,
        resolvedUrl: headUrl,
        response: null,
        html: "",
        status: headResponse.status,
        method: "HEAD",
        reason: "HEAD resolved directly"
      };
    }
  }

  /*
   * Step 2:
   * GET the original share URL.
   */
  let response;

  try {
    response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow",
      headers: FACEBOOK_HEADERS,
      cache: "no-store"
    });
  } catch (error) {
    throw new Error(
      "Facebook GET failed: " + String(error)
    );
  }

  const html = await response.text();

  console.log("GET status:", response.status);
  console.log("GET final URL:", response.url);
  console.log("HTML length:", html.length);

  /*
   * Step 3:
   * Inspect canonical / og:url / final URL
   */
  const inspected = inspectFacebookPage(
    html,
    response.url
  );

  console.log({
    sourceUrl,
    finalUrl: response.url,
    selectedUrl: inspected.selectedUrl,
    canonical: inspected.canonical,
    ogUrl: inspected.ogUrl,
    declaredTarget: inspected.declaredTarget
  });

  /*
   * If canonical / og:url gave us a real Reel/Post,
   * consider the share resolved.
   */
  if (inspected.declaredTarget) {
    return {
      sourceUrl,
      resolvedUrl: inspected.selectedUrl,
      response,
      html,
      status: response.status,
      method: "GET",
      reason: "canonical/og:url resolved"
    };
  }

  /*
   * If Facebook itself redirected us to a real post URL.
   */
  if (looksLikePostUrl(response.url)) {
    return {
      sourceUrl,
      resolvedUrl: response.url,
      response,
      html,
      status: response.status,
      method: "GET",
      reason: "final URL resolved"
    };
  }

  /*
   * Still /share/ or /login.
   */
  if (isSharePath(response.url)) {
    return {
      sourceUrl,
      resolvedUrl: null,
      response,
      html,
      status: response.status,
      method: "GET",
      reason: "Facebook left share URL unresolved"
    };
  }

  if (isLoginPath(response.url)) {
    return {
      sourceUrl,
      resolvedUrl: null,
      response,
      html,
      status: response.status,
      method: "GET",
      reason: "Facebook redirected to login"
    };
  }

  return {
    sourceUrl,
    resolvedUrl: null,
    response,
    html,
    status: response.status,
    method: "GET",
    reason: "No usable Facebook post URL found"
  };
}

function htmlPage(data) {
  const {
    sourceUrl,
    resolvedUrl,
    status,
    reason,
    method,
    title,
    description,
    image,
    canonical,
    ogUrl
  } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>${escapeHtml(title || "C2Z Facebed")}</title>

${
  title
    ? `<meta property="og:title" content="${escapeHtml(title)}">`
    : ""
}

${
  description
    ? `<meta property="og:description" content="${escapeHtml(description)}">`
    : ""
}

${
  image
    ? `<meta property="og:image" content="${escapeHtml(image)}">`
    : ""
}

${
  resolvedUrl
    ? `<meta property="og:url" content="${escapeHtml(resolvedUrl)}">`
    : ""
}

<meta property="og:type" content="video.other">
<meta name="twitter:card" content="summary_large_image">

</head>

<body>

<h1>C2Z Facebed</h1>

<hr>

<p><b>Status:</b> Facebook HTTP ${escapeHtml(status)}</p>

<p><b>Method:</b> ${escapeHtml(method)}</p>

<p><b>Reason:</b> ${escapeHtml(reason)}</p>

<p>
<b>Source:</b><br>
${escapeHtml(sourceUrl)}
</p>

<p>
<b>Resolved URL:</b><br>
${
  resolvedUrl
    ? escapeHtml(resolvedUrl)
    : "NOT RESOLVED"
}
</p>

<p>
<b>Canonical:</b><br>
${
  canonical
    ? escapeHtml(canonical)
    : "NONE"
}
</p>

<p>
<b>og:url:</b><br>
${
  ogUrl
    ? escapeHtml(ogUrl)
    : "NONE"
}
</p>

<p>
<b>Title:</b><br>
${escapeHtml(title || "NONE")}
</p>

${
  description
    ? `<p><b>Description:</b><br>${escapeHtml(description)}</p>`
    : ""
}

${
  image
    ? `<p><b>Image:</b><br>${escapeHtml(image)}</p>`
    : ""
}

</body>
</html>`;
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    /*
     * Home
     */
    if (
      requestUrl.pathname === "/" &&
      !requestUrl.searchParams.has("url")
    ) {
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

    /*
     * Get ?url=
     */
    const targetUrl =
      requestUrl.searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        "Missing ?url= parameter",
        {
          status: 400,
          headers: {
            "content-type":
              "text/plain; charset=UTF-8"
          }
        }
      );
    }

    /*
     * Validate URL
     */
    let facebookUrl;

    try {
      facebookUrl = new URL(targetUrl);
    } catch {
      return new Response(
        "Invalid URL",
        {
          status: 400,
          headers: {
            "content-type":
              "text/plain; charset=UTF-8"
          }
        }
      );
    }

    /*
     * Only Facebook
     */
    if (!isFacebookUrl(facebookUrl.toString())) {
      return new Response(
        "Only Facebook URLs are supported.",
        {
          status: 403,
          headers: {
            "content-type":
              "text/plain; charset=UTF-8"
          }
        }
      );
    }

    try {
      /*
       * Resolve Facebook share URL
       */
      const result =
        await resolveFacebookShare(
          facebookUrl.toString()
        );

      const inspected =
        inspectFacebookPage(
          result.html || "",
          result.response?.url ||
            result.resolvedUrl ||
            facebookUrl.toString()
        );

      return new Response(
        htmlPage({
          sourceUrl:
            result.sourceUrl,

          resolvedUrl:
            result.resolvedUrl,

          status:
            result.status,

          reason:
            result.reason,

          method:
            result.method,

          title:
            inspected.title,

          description:
            inspected.description,

          image:
            inspected.image,

          canonical:
            inspected.canonical,

          ogUrl:
            inspected.ogUrl
        }),
        {
          status: 200,
          headers: {
            "content-type":
              "text/html; charset=UTF-8",

            "cache-control":
              "no-store"
          }
        }
      );

    } catch (error) {
      console.log(
        "Resolver error:",
        String(error)
      );

      return new Response(
        `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>C2Z Facebed Error</title>
</head>
<body>
<h1>C2Z Facebed</h1>
<p><b>Error</b></p>
<pre>${escapeHtml(String(error))}</pre>
</body>
</html>`,
        {
          status: 502,
          headers: {
            "content-type":
              "text/html; charset=UTF-8"
          }
        }
      );
    }
  }
};