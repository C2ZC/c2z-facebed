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
  "Sec-Fetch-User": "?1",
};

// ============================================================
// Basic helpers
// ============================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");
}

function decodeEscapedUrl(value) {
  if (!value) return "";

  let result = String(value);

  result = result
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\u0025/gi, "%")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u003F/gi, "?")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":");

  result = decodeHtmlEntities(result);

  return result;
}

function isFacebookUrl(value) {
  try {
    const url = new URL(value);

    const host = url.hostname.toLowerCase();

    return (
      host === "facebook.com" ||
      host === "www.facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.watch"
    );
  } catch {
    return false;
  }
}

function isSharePath(value) {
  try {
    const url = new URL(value);
    return /^\/share\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function isLoginPath(value) {
  try {
    const url = new URL(value);
    return /\/login/i.test(url.pathname);
  } catch {
    return false;
  }
}

function makeAbsoluteUrl(value, baseUrl) {
  if (!value) return "";

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

function getMeta(html, propertyOrName) {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    ),
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return "";
}

function getCanonical(html) {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
  );

  if (match?.[1]) {
    return decodeHtmlEntities(match[1]);
  }

  const reversed = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
  );

  if (reversed?.[1]) {
    return decodeHtmlEntities(reversed[1]);
  }

  return "";
}

function looksLikePostUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);

    if (!/facebook\.com$/i.test(url.hostname) &&
        !/\.facebook\.com$/i.test(url.hostname)) {
      return false;
    }

    return (
      /\/videos?\//i.test(url.pathname) ||
      /\/reel\//i.test(url.pathname) ||
      /\/reels\//i.test(url.pathname) ||
      /\/posts?\//i.test(url.pathname) ||
      /\/watch/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

// ============================================================
// Inspect Facebook page
// ============================================================

function inspectFacebookPage(html, baseUrl) {
  const canonicalRaw = getCanonical(html);
  const ogUrlRaw = getMeta(html, "og:url");

  const canonical = makeAbsoluteUrl(canonicalRaw, baseUrl);
  const ogUrl = makeAbsoluteUrl(ogUrlRaw, baseUrl);

  const title =
    getMeta(html, "og:title") ||
    getMeta(html, "twitter:title") ||
    "";

  const description =
    getMeta(html, "og:description") ||
    getMeta(html, "description") ||
    "";

  const image =
    getMeta(html, "og:image") ||
    getMeta(html, "twitter:image") ||
    "";

  return {
    canonical,
    ogUrl,
    title,
    description,
    image,
  };
}

// ============================================================
// Resolve Facebook /share/ URL
// ============================================================

async function resolveFacebookShare(sourceUrl) {
  // ----------------------------------------------------------
  // 1. HEAD redirect
  // ----------------------------------------------------------

  try {
    const headResponse = await fetch(sourceUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: FACEBOOK_HEADERS,
    });

    const headFinalUrl = headResponse.url || "";

    if (
      headFinalUrl &&
      !isSharePath(headFinalUrl) &&
      !isLoginPath(headFinalUrl) &&
      looksLikePostUrl(headFinalUrl)
    ) {
      return {
        success: true,
        resolvedUrl: headFinalUrl,
        html: "",
        reason: "HEAD redirect",
      };
    }
  } catch (error) {
    console.log("HEAD resolve failed:", error?.message || error);
  }

  // ----------------------------------------------------------
  // 2. GET original URL
  // ----------------------------------------------------------

  const response = await fetch(sourceUrl, {
    method: "GET",
    redirect: "follow",
    headers: FACEBOOK_HEADERS,
  });

  const html = await response.text();
  const finalUrl = response.url || sourceUrl;

  // ----------------------------------------------------------
  // 3. Read canonical / og:url
  // ----------------------------------------------------------

  const pageInfo = inspectFacebookPage(html, finalUrl);

  const declaredUrl =
    pageInfo.canonical ||
    pageInfo.ogUrl ||
    "";

  if (
    declaredUrl &&
    !isSharePath(declaredUrl) &&
    !isLoginPath(declaredUrl)
  ) {
    return {
      success: true,
      resolvedUrl: declaredUrl,
      html,
      finalUrl,
      title: pageInfo.title,
      description: pageInfo.description,
      image: pageInfo.image,
      reason: "canonical/og:url resolved",
    };
  }

  // ----------------------------------------------------------
  // 4. Final URL itself
  // ----------------------------------------------------------

  if (
    finalUrl &&
    !isSharePath(finalUrl) &&
    !isLoginPath(finalUrl) &&
    looksLikePostUrl(finalUrl)
  ) {
    return {
      success: true,
      resolvedUrl: finalUrl,
      html,
      finalUrl,
      title: pageInfo.title,
      description: pageInfo.description,
      image: pageInfo.image,
      reason: "final URL resolved",
    };
  }

  return {
    success: false,
    resolvedUrl: "",
    html,
    finalUrl,
    title: pageInfo.title,
    description: pageInfo.description,
    image: pageInfo.image,
    reason: isLoginPath(finalUrl)
      ? "Facebook login page"
      : "Could not resolve Facebook URL",
  };
}

// ============================================================
// Extract video URL
// ============================================================

function extractFacebookVideoUrl(html, requestedId = "") {
  if (!html) return "";

  const candidates = [];

  // ----------------------------------------------------------
  // A. application/json blocks
  // ----------------------------------------------------------

  const jsonScriptRegex =
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = jsonScriptRegex.exec(html)) !== null) {
    const raw = match[1];

    if (!raw) continue;

    try {
      const json = JSON.parse(raw);

      walkVideoNodes(json, requestedId, candidates);
    } catch {
      // Some Facebook JSON blocks aren't valid standalone JSON.
      // Fallback regex below will handle them.
    }
  }

  // ----------------------------------------------------------
  // B. Raw HTML fallback
  // ----------------------------------------------------------

  extractRawVideoUrls(html, requestedId, candidates);

  // ----------------------------------------------------------
  // C. Rank candidates
  // ----------------------------------------------------------

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // Prefer HD.
    if (a.isHd !== b.isHd) {
      return a.isHd ? -1 : 1;
    }

    return 0;
  });

  for (const candidate of candidates) {
    if (!candidate.url) continue;

    const decoded = decodeEscapedUrl(candidate.url);

    if (
      /^https?:\/\//i.test(decoded) &&
      /\.(mp4|m4v)(?:[?#]|$)/i.test(decoded)
    ) {
      return decoded;
    }

    // Facebook CDN URLs don't always end with .mp4.
    if (
      /^https?:\/\//i.test(decoded) &&
      /(?:video|fbcdn|scontent)/i.test(decoded)
    ) {
      return decoded;
    }
  }

  return "";
}

// ============================================================
// Walk JSON recursively
// ============================================================

function walkVideoNodes(node, requestedId, candidates, depth = 0) {
  if (!node || depth > 30) return;

  if (typeof node === "string") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkVideoNodes(item, requestedId, candidates, depth + 1);
    }

    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const hd =
    node.browser_native_hd_url ||
    node.browserNativeHdUrl ||
    "";

  const sd =
    node.browser_native_sd_url ||
    node.browserNativeSdUrl ||
    "";

  if (hd) {
    addVideoCandidate(
      hd,
      node,
      requestedId,
      candidates,
      true
    );
  }

  if (sd) {
    addVideoCandidate(
      sd,
      node,
      requestedId,
      candidates,
      false
    );
  }

  // ----------------------------------------------------------
  // videoDeliveryLegacyFields
  // ----------------------------------------------------------

  const legacy = node.videoDeliveryLegacyFields;

  if (legacy && typeof legacy === "object") {
    const legacyHd =
      legacy.browser_native_hd_url ||
      legacy.browserNativeHdUrl ||
      "";

    const legacySd =
      legacy.browser_native_sd_url ||
      legacy.browserNativeSdUrl ||
      "";

    if (legacyHd) {
      addVideoCandidate(
        legacyHd,
        node,
        requestedId,
        candidates,
        true
      );
    }

    if (legacySd) {
      addVideoCandidate(
        legacySd,
        node,
        requestedId,
        candidates,
        false
      );
    }
  }

  // ----------------------------------------------------------
  // Continue recursively
  // ----------------------------------------------------------

  for (const [key, value] of Object.entries(node)) {
    if (
      key === "browser_native_hd_url" ||
      key === "browser_native_sd_url" ||
      key === "browserNativeHdUrl" ||
      key === "browserNativeSdUrl" ||
      key === "videoDeliveryLegacyFields"
    ) {
      continue;
    }

    walkVideoNodes(value, requestedId, candidates, depth + 1);
  }
}

function addVideoCandidate(
  url,
  node,
  requestedId,
  candidates,
  isHd
) {
  if (!url || typeof url !== "string") return;

  let score = 0;

  let serialized = "";

  try {
    serialized = JSON.stringify(node);
  } catch {
    serialized = "";
  }

  // Strong match if requested video ID appears in same node.
  if (
    requestedId &&
    serialized &&
    serialized.includes(requestedId)
  ) {
    score += 100;
  }

  if (isHd) {
    score += 20;
  }

  candidates.push({
    url,
    score,
    isHd,
  });
}

// ============================================================
// Raw HTML fallback
// ============================================================

function extractRawVideoUrls(
  html,
  requestedId,
  candidates
) {
  const keys = [
    "browser_native_hd_url",
    "browser_native_sd_url",
  ];

  for (const key of keys) {
    const regex = new RegExp(
      `"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
      "gi"
    );

    let match;

    while ((match = regex.exec(html)) !== null) {
      const surroundingStart =
        Math.max(0, match.index - 5000);

      const surroundingEnd =
        Math.min(
          html.length,
          match.index + match[0].length + 5000
        );

      const surrounding =
        html.slice(
          surroundingStart,
          surroundingEnd
        );

      let score = 0;

      if (
        requestedId &&
        surrounding.includes(requestedId)
      ) {
        score += 100;
      }

      if (
        key === "browser_native_hd_url"
      ) {
        score += 20;
      }

      candidates.push({
        url: match[1],
        score,
        isHd:
          key === "browser_native_hd_url",
      });
    }
  }

  // Another Facebook format:
  // browser_native_hd_url:"https://..."
  const looseRegex =
    /browser_native_(hd|sd)_url["']?\s*[:=]\s*["']((?:\\.|[^"\\])*)["']/gi;

  let looseMatch;

  while (
    (looseMatch = looseRegex.exec(html)) !== null
  ) {
    const type = looseMatch[1];
    const url = looseMatch[2];

    let score = type === "hd" ? 20 : 0;

    const surroundingStart =
      Math.max(0, looseMatch.index - 5000);

    const surroundingEnd =
      Math.min(
        html.length,
        looseMatch.index +
          looseMatch[0].length +
          5000
      );

    const surrounding =
      html.slice(
        surroundingStart,
        surroundingEnd
      );

    if (
      requestedId &&
      surrounding.includes(requestedId)
    ) {
      score += 100;
    }

    candidates.push({
      url,
      score,
      isHd: type === "hd",
    });
  }
}

// ============================================================
// Extract Facebook video ID
// ============================================================

function extractVideoId(url) {
  if (!url) return "";

  const patterns = [
    /\/videos\/(\d+)/i,
    /\/video\/(\d+)/i,
    /\/reel\/(\d+)/i,
    /\/reels\/(\d+)/i,
  ];

  for (const regex of patterns) {
    const match = url.match(regex);

    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

// ============================================================
// HTML page
// ============================================================

function htmlPage(data) {
  const {
    sourceUrl,
    resolvedUrl,
    videoUrl,
    title,
    description,
    image,
    reason,
  } = data;

  const safeTitle =
    title || "Facebook Video";

  const safeDescription =
    description ||
    "Facebook video converted by Facebed";

  const hasVideo = Boolean(videoUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>${escapeHtml(safeTitle)}</title>

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<meta
  name="description"
  content="${escapeHtml(safeDescription)}"
>

<meta
  property="og:title"
  content="${escapeHtml(safeTitle)}"
>

<meta
  property="og:description"
  content="${escapeHtml(safeDescription)}"
>

<meta
  property="og:type"
  content="video.other"
>

<meta
  property="og:url"
  content="${escapeHtml(sourceUrl)}"
>

${
  image
    ? `<meta
  property="og:image"
  content="${escapeHtml(image)}"
>`
    : ""
}

${
  videoUrl
    ? `<meta
  property="og:video"
  content="${escapeHtml(videoUrl)}"
>

<meta
  property="og:video:url"
  content="${escapeHtml(videoUrl)}"
>

<meta
  property="og:video:secure_url"
  content="${escapeHtml(videoUrl)}"
>

<meta
  property="og:video:type"
  content="video/mp4"
>

<meta
  property="og:video:width"
  content="1280"
>

<meta
  property="og:video:height"
  content="720"
>

<meta
  name="twitter:card"
  content="player"
>

<meta
  name="twitter:title"
  content="${escapeHtml(safeTitle)}"
>

<meta
  name="twitter:description"
  content="${escapeHtml(safeDescription)}"
>

<meta
  name="twitter:player:stream"
  content="${escapeHtml(videoUrl)}"
>

<meta
  name="twitter:player:stream:content_type"
  content="video/mp4"
>`
    : ""
}

<style>
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 24px;
    background: #111;
    color: #eee;
    font-family:
      Arial,
      Helvetica,
      sans-serif;
  }

  .container {
    max-width: 1000px;
    margin: auto;
  }

  h1 {
    font-size: 22px;
    margin-bottom: 20px;
  }

  .video {
    width: 100%;
    max-width: 900px;
    background: #000;
    border-radius: 8px;
  }

  .info {
    margin-top: 20px;
    padding: 16px;
    background: #1d1d1d;
    border-radius: 8px;
    word-break: break-word;
  }

  .ok {
    color: #57e389;
  }

  .error {
    color: #ff6b6b;
  }

  a {
    color: #65b7ff;
  }

  code {
    word-break: break-all;
  }
</style>

</head>

<body>

<div class="container">

<h1>${escapeHtml(safeTitle)}</h1>

${
  hasVideo
    ? `<video
  class="video"
  controls
  preload="metadata"
  playsinline
  poster="${escapeHtml(image || "")}"
>
  <source
    src="${escapeHtml(videoUrl)}"
    type="video/mp4"
  >
  Your browser does not support HTML5 video.
</video>`
    : `<div class="info">
  <div class="error">
    Video URL: NOT FOUND
  </div>
</div>`
}

<div class="info">

<p>
  <strong>Status:</strong>
  <span class="${hasVideo ? "ok" : "error"}">
    ${hasVideo ? "VIDEO FOUND" : "VIDEO NOT FOUND"}
  </span>
</p>

<p>
  <strong>Resolve:</strong>
  ${escapeHtml(reason || "-")}
</p>

<p>
  <strong>Source:</strong><br>
  <a
    href="${escapeHtml(sourceUrl)}"
    target="_blank"
    rel="noopener"
  >
    ${escapeHtml(sourceUrl)}
  </a>
</p>

${
  resolvedUrl
    ? `<p>
  <strong>Resolved:</strong><br>
  <a
    href="${escapeHtml(resolvedUrl)}"
    target="_blank"
    rel="noopener"
  >
    ${escapeHtml(resolvedUrl)}
  </a>
</p>`
    : ""
}

${
  videoUrl
    ? `<p>
  <strong>Video URL:</strong><br>
  <code>${escapeHtml(videoUrl)}</code>
</p>`
    : ""
}

</div>

</div>

</body>
</html>`;
}

// ============================================================
// Error response
// ============================================================

function errorResponse(message, status = 400) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

// ============================================================
// Main Worker
// ============================================================

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    // --------------------------------------------------------
    // Home
    // --------------------------------------------------------

    if (
      requestUrl.pathname === "/" &&
      !requestUrl.searchParams.has("url")
    ) {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>C2Z Facebed</title>
<style>
body {
  font-family: Arial, sans-serif;
  background: #111;
  color: #eee;
  padding: 40px;
}
.container {
  max-width: 800px;
  margin: auto;
}
code {
  background: #222;
  padding: 4px 8px;
  border-radius: 5px;
}
</style>
</head>

<body>

<div class="container">

<h1>C2Z Facebed</h1>

<p>
Facebook → Discord video resolver
</p>

<h3>Usage</h3>

<p>
<code>/?url=FACEBOOK_URL</code>
</p>

<p>
<code>/video?url=FACEBOOK_URL</code>
</p>

</div>

</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Cache-Control": "no-store",
        },
      });
    }

    // --------------------------------------------------------
    // URL parameter
    // --------------------------------------------------------

    const sourceUrl =
      requestUrl.searchParams.get("url");

    if (!sourceUrl) {
      return errorResponse(
        "Missing ?url= parameter"
      );
    }

    let facebookUrl;

    try {
      facebookUrl =
        decodeURIComponent(sourceUrl);
    } catch {
      facebookUrl = sourceUrl;
    }

    if (!isFacebookUrl(facebookUrl)) {
      return errorResponse(
        "Only Facebook URLs are supported",
        400
      );
    }

    // ========================================================
    // /video
    //
    // Resolve Facebook → MP4 → HTTP 302
    // ========================================================

    if (requestUrl.pathname === "/video") {
      console.log(
        "Video request:",
        facebookUrl
      );

      try {
        const resolved =
          await resolveFacebookShare(
            facebookUrl
          );

        if (!resolved.success) {
          return errorResponse(
            resolved.reason ||
              "Could not resolve Facebook URL",
            404
          );
        }

        let videoUrl =
          extractFacebookVideoUrl(
            resolved.html,
            extractVideoId(
              resolved.resolvedUrl
            )
          );

        // ----------------------------------------------------
        // If share page didn't contain video,
        // fetch resolved page.
        // ----------------------------------------------------

        if (!videoUrl && resolved.resolvedUrl) {
          console.log(
            "Fetching resolved page:",
            resolved.resolvedUrl
          );

          const videoResponse =
            await fetch(
              resolved.resolvedUrl,
              {
                method: "GET",
                redirect: "follow",
                headers: FACEBOOK_HEADERS,
              }
            );

          const videoHtml =
            await videoResponse.text();

          videoUrl =
            extractFacebookVideoUrl(
              videoHtml,
              extractVideoId(
                resolved.resolvedUrl
              )
            );
        }

        if (!videoUrl) {
          return errorResponse(
            "Video URL not found",
            404
          );
        }

        console.log(
          "Redirecting to video:"
        );

        console.log(
          videoUrl.substring(0, 150)
        );

        // ----------------------------------------------------
        // Don't cache because Facebook CDN URLs can expire.
        // ----------------------------------------------------

        return new Response(null, {
          status: 302,
          headers: {
            Location: videoUrl,
            "Cache-Control":
              "no-store, max-age=0",
          },
        });
      } catch (error) {
        console.log(
          "Video endpoint error:",
          error?.stack ||
            error?.message ||
            error
        );

        return errorResponse(
          "Internal resolver error",
          500
        );
      }
    }

    // ========================================================
    // /embed
    //
    // HTML page with OG video metadata
    // ========================================================

    if (requestUrl.pathname === "/embed") {
      // Continue below.
    }

    // ========================================================
    // Normal HTML resolver
    // ========================================================

    try {
      console.log(
        "Resolving:",
        facebookUrl
      );

      const resolved =
        await resolveFacebookShare(
          facebookUrl
        );

      if (!resolved.success) {
        return new Response(
          htmlPage({
            sourceUrl: facebookUrl,
            resolvedUrl:
              resolved.resolvedUrl,
            videoUrl: "",
            title:
              resolved.title ||
              "Facebook",
            description:
              resolved.description ||
              resolved.reason,
            image:
              resolved.image || "",
            reason:
              resolved.reason,
          }),
          {
            status: 404,
            headers: {
              "Content-Type":
                "text/html; charset=UTF-8",
              "Cache-Control":
                "no-store",
            },
          }
        );
      }

      // ------------------------------------------------------
      // First try video from share page
      // ------------------------------------------------------

      let videoUrl =
        extractFacebookVideoUrl(
          resolved.html,
          extractVideoId(
            resolved.resolvedUrl
          )
        );

      // ------------------------------------------------------
      // If not found, fetch resolved page
      // ------------------------------------------------------

      if (!videoUrl && resolved.resolvedUrl) {
        console.log(
          "Video not found on share page."
        );

        console.log(
          "Fetching resolved page:"
        );

        console.log(
          resolved.resolvedUrl
        );

        const videoResponse =
          await fetch(
            resolved.resolvedUrl,
            {
              method: "GET",
              redirect: "follow",
              headers: FACEBOOK_HEADERS,
            }
          );

        const videoHtml =
          await videoResponse.text();

        videoUrl =
          extractFacebookVideoUrl(
            videoHtml,
            extractVideoId(
              resolved.resolvedUrl
            )
          );
      }

      console.log(
        "Video URL:",
        videoUrl
          ? "FOUND"
          : "NOT FOUND"
      );

      return new Response(
        htmlPage({
          sourceUrl: facebookUrl,
          resolvedUrl:
            resolved.resolvedUrl,
          videoUrl,
          title:
            resolved.title ||
            "Facebook Video",
          description:
            resolved.description ||
            "Facebook video",
          image:
            resolved.image || "",
          reason:
            resolved.reason,
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/html; charset=UTF-8",

            // Don't let Discord/browser cache
            // an expired Facebook CDN URL.
            "Cache-Control":
              "no-store, max-age=0",
          },
        }
      );
    } catch (error) {
      console.log(
        "Worker error:",
        error?.stack ||
          error?.message ||
          error
      );

      return errorResponse(
        "Internal Worker error",
        500
      );
    }
  },
};