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
};

// ============================================================
// HELPERS
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

  return decodeHtmlEntities(result);
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
  const escaped = propertyOrName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

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

  return "";
}

function isSupportedFacebookPath(pathname, search = "") {
  const path = pathname.replace(/\/+$/, "");
  const params = new URLSearchParams(search);

  if (/^\/share\/(r|p|v|[^/]+)(\/[^/]+)?$/i.test(path)) return true;

  if (/^\/[^/]+\/posts\/[^/]+$/i.test(path)) return true;

  if (/^\/[^/]+\/videos\/\d+$/i.test(path)) return true;

  if (/^\/groups\/[^/]+\/posts\/[^/]+$/i.test(path)) return true;

  if (/^\/groups\/[^/]+\/permalink\/[^/]+$/i.test(path)) return true;

  if (/^\/reels?\/\d+$/i.test(path)) return true;

  if (/^\/watch$/i.test(path) && params.has("v")) return true;

  if (
    /^\/permalink\.php$/i.test(path) &&
    params.has("story_fbid")
  ) {
    return true;
  }

  if (
    /^\/story\.php$/i.test(path) &&
    params.has("story_fbid")
  ) {
    return true;
  }

  return false;
}

function extractFacebookUrlFromPath(requestUrl) {
  let path = requestUrl.pathname;

  if (path.startsWith("/")) {
    path = path.substring(1);
  }

  try {
    path = decodeURIComponent(path);
  } catch {}

  if (!/^https?:\/\//i.test(path)) {
    return "";
  }

  let facebookUrl = path;

  if (requestUrl.search) {
    facebookUrl += requestUrl.search;
  }

  if (!isFacebookUrl(facebookUrl)) {
    return "";
  }

  return facebookUrl;
}

// ============================================================
// INSPECT PAGE
// ============================================================

function inspectFacebookPage(html, baseUrl) {
  const canonical = makeAbsoluteUrl(
    getCanonical(html),
    baseUrl
  );

  const ogUrl = makeAbsoluteUrl(
    getMeta(html, "og:url"),
    baseUrl
  );

  let rawTitle =
    getMeta(html, "og:title") ||
    getMeta(html, "twitter:title") ||
    "";

  if (!rawTitle) {
    const titleMatch = html.match(
      /<title[^>]*>([^<]+)<\/title>/i
    );

    if (titleMatch?.[1]) {
      rawTitle = decodeHtmlEntities(titleMatch[1]);
    }
  }

  let description =
    getMeta(html, "og:description") ||
    getMeta(html, "description") ||
    "";

  const image =
    getMeta(html, "og:image") ||
    getMeta(html, "twitter:image") ||
    "";

  // ==========================================================
  // POSTER / VIDEO OWNER
  // ==========================================================
  //
  // Facebook บางครั้งส่ง og:title เป็น "Facebook Video"
  // ทำให้ไม่สามารถใช้ og:title เป็นชื่อคนโพสต์ได้
  //
  // ลองหา:
  // short_form_video_context.video_owner
  // video_owner
  // videoOwner
  // owner
  // author
  // actor
  //
  // ก่อน fallback กลับไปใช้ og:title
  // ==========================================================

  let authorName = "";
  let contentTitle = rawTitle;

  const authorPatterns = [
    /"short_form_video_context"\s*:\s*\{[\s\S]{0,5000}?"video_owner"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"([^"]+)"/i,

    /"video_owner"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"([^"]+)"/i,

    /"videoOwner"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"([^"]+)"/i,

    /"owner"\s*:\s*\{[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/i,

    /"author"\s*:\s*\{[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/i,

    /"actor"\s*:\s*\{[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/i,
  ];

  for (const regex of authorPatterns) {
    const match = html.match(regex);

    if (match?.[1]) {
      const candidate =
        decodeEscapedUrl(match[1]).trim();

      if (
        candidate &&
        candidate !== "Facebook Video" &&
        candidate.length < 200
      ) {
        authorName = candidate;
        break;
      }
    }
  }

  // ==========================================================
  // FALLBACK: OG TITLE
  // ==========================================================

  if (
    !authorName &&
    rawTitle &&
    rawTitle !== "Facebook Video"
  ) {
    if (rawTitle.includes(" | Facebook")) {
      authorName = rawTitle
        .replace(" | Facebook", "")
        .trim();

      contentTitle = description || authorName;

    } else if (rawTitle.includes(" - ")) {
      const parts = rawTitle.split(" - ");

      authorName = parts[0].trim();

      contentTitle = parts
        .slice(1)
        .join(" - ")
        .trim();

    } else {
      authorName = rawTitle;
    }
  }

  if (!authorName) {
    authorName = "Facebook Video";
  }

  // ==========================================================
  // STATS
  // ==========================================================

  let creationTime = "";
  let reactionCount = "";
  let commentCount = "";
  let shareCount = "";

  try {
    const timeMatch =
      html.match(
        /"publish_time"\s*:\s*(\d+)/i
      ) ||
      html.match(
        /"creation_time"\s*:\s*(\d+)/i
      );

    if (timeMatch?.[1]) {
      const date = new Date(
        parseInt(timeMatch[1], 10) * 1000
      );

      creationTime =
        date
          .toISOString()
          .replace("T", " ")
          .substring(0, 19) +
        " UTC";
    }

    const reactMatch = html.match(
      /"reaction_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i
    );

    if (reactMatch?.[1]) {
      reactionCount = reactMatch[1];
    }

    const commentMatch = html.match(
      /"comment_count"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/i
    );

    if (commentMatch?.[1]) {
      commentCount = commentMatch[1];
    }

    const shareMatch = html.match(
      /"share_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i
    );

    if (shareMatch?.[1]) {
      shareCount = shareMatch[1];
    }
  } catch {}

  return {
    canonical,
    ogUrl,
    authorName,
    title: contentTitle || authorName,
    description,
    image,
    creationTime,
    reactionCount,
    commentCount,
    shareCount,
  };
}

// ============================================================
// RESOLVE FACEBOOK URL
// ============================================================

async function resolveFacebookShare(sourceUrl) {
  const response = await fetch(sourceUrl, {
    method: "GET",
    redirect: "follow",
    headers: FACEBOOK_HEADERS,
  });

  const html = await response.text();

  const finalUrl =
    response.url || sourceUrl;

  const pageInfo =
    inspectFacebookPage(
      html,
      finalUrl
    );

  return {
    success: true,

    resolvedUrl:
      pageInfo.canonical ||
      pageInfo.ogUrl ||
      finalUrl,

    html,

    authorName:
      pageInfo.authorName,

    title:
      pageInfo.title,

    description:
      pageInfo.description,

    image:
      pageInfo.image,

    creationTime:
      pageInfo.creationTime,

    reactionCount:
      pageInfo.reactionCount,

    commentCount:
      pageInfo.commentCount,

    shareCount:
      pageInfo.shareCount,
  };
}

// ============================================================
// EXTRACT VIDEO URL
// ============================================================

function extractFacebookVideoUrl(html) {
  if (!html) return "";

  const candidates = [];

  const jsonScriptRegex =
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while (
    (match = jsonScriptRegex.exec(html)) !== null
  ) {
    const raw = match[1];

    if (!raw) continue;

    try {
      const json = JSON.parse(raw);

      walkVideoNodes(
        json,
        candidates
      );
    } catch {}
  }

  candidates.sort((a, b) =>
    b.isHd === a.isHd
      ? 0
      : b.isHd
        ? 1
        : -1
  );

  for (const candidate of candidates) {
    if (!candidate.url) continue;

    const decoded =
      decodeEscapedUrl(
        candidate.url
      );

    if (
      /^https?:\/\//i.test(decoded) &&
      (
        /\.(mp4|m4v)(?:[?#]|$)/i.test(
          decoded
        ) ||
        /(?:video|fbcdn|scontent)/i.test(
          decoded
        )
      )
    ) {
      return decoded;
    }
  }

  return "";
}

function walkVideoNodes(
  node,
  candidates,
  depth = 0
) {
  if (!node || depth > 25) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      walkVideoNodes(
        item,
        candidates,
        depth + 1
      );
    }

    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const hd =
    node.browser_native_hd_url ||
    node.browserNativeHdUrl;

  const sd =
    node.browser_native_sd_url ||
    node.browserNativeSdUrl;

  if (hd) {
    candidates.push({
      url: hd,
      isHd: true,
    });
  }

  if (sd) {
    candidates.push({
      url: sd,
      isHd: false,
    });
  }

  for (const [
    key,
    value,
  ] of Object.entries(node)) {
    if (
      key.includes("browser_native") ||
      key.includes("browserNative")
    ) {
      continue;
    }

    walkVideoNodes(
      value,
      candidates,
      depth + 1
    );
  }
}

// ============================================================
// HTML GENERATOR
// ============================================================

function htmlPage(data) {
  const {
    sourceUrl,
    embedUrl,
    videoUrl,
    authorName,
    title,
    description,
    image,
    creationTime,
    reactionCount,
    commentCount,
    shareCount,
  } = data;

  const siteName =
    authorName &&
    authorName !== "Facebook Video"
      ? authorName
      : "C2Z Facebed";

  const displayTitle =
    title || "Facebook Video";

  let statsList = [];

  if (creationTime) {
    statsList.push(
      `🕒 ${creationTime}`
    );
  }

  let subStats = [];

  if (reactionCount) {
    subStats.push(
      `💖 ${reactionCount}`
    );
  }

  if (commentCount) {
    subStats.push(
      `💬 ${commentCount}`
    );
  }

  if (shareCount) {
    subStats.push(
      `🔄 ${shareCount}`
    );
  }

  if (subStats.length > 0) {
    statsList.push(
      subStats.join(" · ")
    );
  }

  let embedDescription =
    statsList.join("\n");

  if (
    !embedDescription &&
    description
  ) {
    embedDescription =
      description;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<!-- Client-side Redirect สำหรับคนเปิดเบราว์เซอร์จริง -->
<meta http-equiv="refresh" content="0;url=${escapeHtml(sourceUrl)}">

<script>
window.location.replace("${escapeHtml(sourceUrl)}");
</script>

<title>${escapeHtml(displayTitle)}</title>

<!-- Discord Rich Embed Meta Tags -->

<meta property="og:site_name" content="${escapeHtml(siteName)}">

<meta property="og:title" content="${escapeHtml(displayTitle)}">

<meta property="og:description" content="${escapeHtml(embedDescription)}">

<meta property="og:type" content="video.other">

<meta property="og:url" content="${escapeHtml(embedUrl || sourceUrl)}">

<meta name="theme-color" content="#2160C4">

${
  image
    ? `<meta property="og:image" content="${escapeHtml(image)}">`
    : ""
}

${
  videoUrl
    ? `
<meta property="og:video" content="${escapeHtml(videoUrl)}">

<meta property="og:video:url" content="${escapeHtml(videoUrl)}">

<meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}">

<meta property="og:video:type" content="video/mp4">

<meta property="og:video:width" content="1280">

<meta property="og:video:height" content="720">

<meta name="twitter:card" content="player">

<meta name="twitter:title" content="${escapeHtml(displayTitle)}">

<meta name="twitter:description" content="${escapeHtml(embedDescription)}">

<meta name="twitter:player:stream" content="${escapeHtml(videoUrl)}">

<meta name="twitter:player:stream:content_type" content="video/mp4">
`
    : ""
}

</head>

<body>

<p>
Redirecting to
<a href="${escapeHtml(sourceUrl)}">
${escapeHtml(sourceUrl)}
</a>...
</p>

</body>
</html>`;
}

// ============================================================
// WORKER ENTRYPOINT
// ============================================================

export default {
  async fetch(request) {
    const requestUrl =
      new URL(request.url);

    // ========================================================
    // HOME
    // ========================================================

    if (
      requestUrl.pathname === "/" &&
      !requestUrl.searchParams.has("url")
    ) {
      return new Response(
        "C2Z Facebed Online",
        {
          status: 200,
        }
      );
    }

    // ========================================================
    // PROCESS FACEBOOK EMBED
    // ========================================================

    async function processAndRenderEmbed(
      targetFbUrl
    ) {
      try {
        const resolved =
          await resolveFacebookShare(
            targetFbUrl
          );

        let videoUrl =
          extractFacebookVideoUrl(
            resolved.html
          );

        if (
          !videoUrl &&
          resolved.resolvedUrl
        ) {
          const videoResp =
            await fetch(
              resolved.resolvedUrl,
              {
                headers:
                  FACEBOOK_HEADERS,
              }
            );

          const videoHtml =
            await videoResp.text();

          videoUrl =
            extractFacebookVideoUrl(
              videoHtml
            );
        }

        let discordVideoUrl = "";

        if (videoUrl) {
          discordVideoUrl =
            new URL(
              "/video",
              requestUrl.origin
            ).href +
            "?url=" +
            encodeURIComponent(
              targetFbUrl
            );
        }

        return new Response(
          htmlPage({
            sourceUrl:
              targetFbUrl,

            embedUrl:
              requestUrl.href,

            videoUrl:
              discordVideoUrl,

            authorName:
              resolved.authorName,

            title:
              resolved.title,

            description:
              resolved.description,

            image:
              resolved.image,

            creationTime:
              resolved.creationTime,

            reactionCount:
              resolved.reactionCount,

            commentCount:
              resolved.commentCount,

            shareCount:
              resolved.shareCount,
          }),
          {
            status: 200,

            headers: {
              "Content-Type":
                "text/html; charset=UTF-8",

              "Cache-Control":
                "no-store, max-age=0",
            },
          }
        );
      } catch (error) {
        return Response.redirect(
          targetFbUrl,
          302
        );
      }
    }

    // ========================================================
    // 1. EMBEDDED FACEBOOK URL
    //
    // https://fb.c2z.top/https://www.facebook.com/...
    // ========================================================

    const embeddedFacebookUrl =
      extractFacebookUrlFromPath(
        requestUrl
      );

    if (embeddedFacebookUrl) {
      return await processAndRenderEmbed(
        embeddedFacebookUrl
      );
    }

    // ========================================================
    // 2. DIRECT FACEBOOK PATH
    //
    // https://fb.c2z.top/share/v/xxx
    // ========================================================

    if (
      isSupportedFacebookPath(
        requestUrl.pathname,
        requestUrl.search
      )
    ) {
      const facebookUrl =
        "https://www.facebook.com" +
        requestUrl.pathname +
        requestUrl.search;

      return await processAndRenderEmbed(
        facebookUrl
      );
    }

    // ========================================================
    // 3. DIRECT VIDEO STREAM
    //
    // https://fb.c2z.top/video?url=...
    // ========================================================

    const sourceUrl =
      requestUrl.searchParams.get(
        "url"
      );

    if (
      requestUrl.pathname === "/video" &&
      sourceUrl
    ) {
      let facebookUrl =
        decodeURIComponent(
          sourceUrl
        );

      try {
        const resolved =
          await resolveFacebookShare(
            facebookUrl
          );

        let videoUrl =
          extractFacebookVideoUrl(
            resolved.html
          );

        if (
          !videoUrl &&
          resolved.resolvedUrl
        ) {
          const videoResp =
            await fetch(
              resolved.resolvedUrl,
              {
                headers:
                  FACEBOOK_HEADERS,
              }
            );

          const videoHtml =
            await videoResp.text();

          videoUrl =
            extractFacebookVideoUrl(
              videoHtml
            );
        }

        if (!videoUrl) {
          return Response.redirect(
            facebookUrl,
            302
          );
        }

        return new Response(null, {
          status: 302,

          headers: {
            Location: videoUrl,

            "Cache-Control":
              "no-store, max-age=0",
          },
        });
      } catch (error) {
        return Response.redirect(
          facebookUrl,
          302
        );
      }
    }

    // ========================================================
    // 404
    // ========================================================

    return new Response(
      "Not Found",
      {
        status: 404,
      }
    );
  },
};