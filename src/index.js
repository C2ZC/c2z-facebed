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

function isBotRequest(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  return (
    ua.includes("discordbot") ||
    ua.includes("telegrambot") ||
    ua.includes("twitterbot") ||
    ua.includes("facebookexternalhit") ||
    ua.includes("slackbot") ||
    ua.includes("whatsapp") ||
    ua.includes("bot") ||
    ua.includes("crawler") ||
    ua.includes("spider")
  );
}

// ============================================================
// BASIC HELPERS
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

function formatNumber(num) {
  if (!num || isNaN(num)) return "";
  const n = parseInt(num, 10);
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
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
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
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
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (match?.[1]) return decodeHtmlEntities(match[1]);

  const reversed = html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (reversed?.[1]) return decodeHtmlEntities(reversed[1]);

  return "";
}

function looksLikePostUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!/facebook\.com$/i.test(url.hostname) && !/\.facebook\.com$/i.test(url.hostname)) {
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
  if (/^\/permalink\.php$/i.test(path) && params.has("story_fbid")) return true;
  if (/^\/story\.php$/i.test(path) && params.has("story_fbid")) return true;

  return false;
}

function extractFacebookUrlFromPath(requestUrl) {
  let path = requestUrl.pathname;
  if (path.startsWith("/")) path = path.substring(1);

  try {
    path = decodeURIComponent(path);
  } catch {}

  if (!/^https?:\/\//i.test(path)) return "";

  let facebookUrl = path;
  if (requestUrl.search) facebookUrl += requestUrl.search;
  if (!isFacebookUrl(facebookUrl)) return "";

  return facebookUrl;
}

// ============================================================
// INSPECT FACEBOOK PAGE (EXTRACT AUTHOR & DETAILS)
// ============================================================

function inspectFacebookPage(html, baseUrl) {
  const canonical = makeAbsoluteUrl(getCanonical(html), baseUrl);
  const ogUrl = makeAbsoluteUrl(getMeta(html, "og:url"), baseUrl);

  let rawTitle =
    getMeta(html, "og:title") ||
    getMeta(html, "twitter:title") ||
    "";

  if (!rawTitle) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
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

  // ดึงชื่อเจ้าของโพสต์
  let authorName = "";
  if (rawTitle.includes(" | Facebook")) {
    authorName = rawTitle.replace(" | Facebook", "").trim();
  } else if (rawTitle.includes(" - ")) {
    authorName = rawTitle.split(" - ")[0].trim();
  } else if (rawTitle && !rawTitle.toLowerCase().includes("facebook")) {
    authorName = rawTitle.trim();
  }

  // ดึงสถิติ Reaction, Comment, Share
  let reactionCount = "";
  let commentCount = "";
  let shareCount = "";

  try {
    const reactMatch = html.match(/"reaction_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i) || html.match(/"i18n_reaction_count"\s*:\s*"([^"]+)"/i);
    if (reactMatch?.[1]) reactionCount = reactMatch[1];

    const commentMatch = html.match(/"comment_count"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/i) || html.match(/"i18n_comment_count"\s*:\s*"([^"]+)"/i);
    if (commentMatch?.[1]) commentCount = commentMatch[1];

    const shareMatch = html.match(/"share_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i) || html.match(/"i18n_share_count"\s*:\s*"([^"]+)"/i);
    if (shareMatch?.[1]) shareCount = shareMatch[1];
  } catch {}

  let statsParts = [];
  if (reactionCount) statsParts.push(`❤️ ${formatNumber(reactionCount)}`);
  if (commentCount) statsParts.push(`💬 ${formatNumber(commentCount)}`);
  if (shareCount) statsParts.push(`🔁 ${formatNumber(shareCount)}`);

  let formattedStats = statsParts.join(" • ");

  return {
    canonical,
    ogUrl,
    authorName: authorName || "Facebook Video",
    description: formattedStats || description || "Facebook Reel/Video",
    image,
  };
}

// ============================================================
// RESOLVE FACEBOOK URL
// ============================================================

async function resolveFacebookShare(sourceUrl) {
  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow",
      headers: FACEBOOK_HEADERS,
    });

    const html = await response.text();
    const finalUrl = response.url || sourceUrl;
    const pageInfo = inspectFacebookPage(html, finalUrl);

    return {
      success: true,
      resolvedUrl: pageInfo.canonical || pageInfo.ogUrl || finalUrl,
      html,
      authorName: pageInfo.authorName,
      description: pageInfo.description,
      image: pageInfo.image,
    };
  } catch (error) {
    return {
      success: false,
      resolvedUrl: sourceUrl,
      html: "",
      authorName: "Facebook Video",
      description: "Facebook Reel/Video",
      image: "",
    };
  }
}

// ============================================================
// EXTRACT VIDEO URL
// ============================================================

function extractFacebookVideoUrl(html, requestedId = "") {
  if (!html) return "";

  const candidates = [];
  const jsonScriptRegex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonScriptRegex.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const json = JSON.parse(raw);
      walkVideoNodes(json, requestedId, candidates);
    } catch {}
  }

  extractRawVideoUrls(html, requestedId, candidates);

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isHd !== b.isHd) return a.isHd ? -1 : 1;
    return 0;
  });

  for (const candidate of candidates) {
    if (!candidate.url) continue;
    const decoded = decodeEscapedUrl(candidate.url);
    if (/^https?:\/\//i.test(decoded) && /\.(mp4|m4v)(?:[?#]|$)/i.test(decoded)) {
      return decoded;
    }
    if (/^https?:\/\//i.test(decoded) && /(?:video|fbcdn|scontent)/i.test(decoded)) {
      return decoded;
    }
  }

  return "";
}

function walkVideoNodes(node, requestedId, candidates, depth = 0) {
  if (!node || depth > 30 || typeof node === "string") return;

  if (Array.isArray(node)) {
    for (const item of node) walkVideoNodes(item, requestedId, candidates, depth + 1);
    return;
  }

  if (typeof node !== "object") return;

  const hd = node.browser_native_hd_url || node.browserNativeHdUrl || "";
  const sd = node.browser_native_sd_url || node.browserNativeSdUrl || "";

  if (hd) addVideoCandidate(hd, node, requestedId, candidates, true);
  if (sd) addVideoCandidate(sd, node, requestedId, candidates, false);

  const legacy = node.videoDeliveryLegacyFields;
  if (legacy && typeof legacy === "object") {
    const legacyHd = legacy.browser_native_hd_url || legacy.browserNativeHdUrl || "";
    const legacySd = legacy.browser_native_sd_url || legacy.browserNativeSdUrl || "";
    if (legacyHd) addVideoCandidate(legacyHd, node, requestedId, candidates, true);
    if (legacySd) addVideoCandidate(legacySd, node, requestedId, candidates, false);
  }

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

function addVideoCandidate(url, node, requestedId, candidates, isHd) {
  if (!url || typeof url !== "string") return;
  let score = 0;
  let serialized = "";
  try {
    serialized = JSON.stringify(node);
  } catch {
    serialized = "";
  }

  if (requestedId && serialized && serialized.includes(requestedId)) score += 100;
  if (isHd) score += 20;

  candidates.push({ url, score, isHd });
}

function extractRawVideoUrls(html, requestedId, candidates) {
  const keys = ["browser_native_hd_url", "browser_native_sd_url"];
  for (const key of keys) {
    const regex = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "gi");
    let match;
    while ((match = regex.exec(html)) !== null) {
      const surroundingStart = Math.max(0, match.index - 5000);
      const surroundingEnd = Math.min(html.length, match.index + match[0].length + 5000);
      const surrounding = html.slice(surroundingStart, surroundingEnd);
      let score = 0;

      if (requestedId && surrounding.includes(requestedId)) score += 100;
      if (key === "browser_native_hd_url") score += 20;

      candidates.push({
        url: match[1],
        score,
        isHd: key === "browser_native_hd_url",
      });
    }
  }
}

function extractVideoId(url) {
  if (!url) return "";
  const patterns = [/\/videos\/(\d+)/i, /\/video\/(\d+)/i, /\/reel\/(\d+)/i, /\/reels\/(\d+)/i];
  for (const regex of patterns) {
    const match = url.match(regex);
    if (match?.[1]) return match[1];
  }
  return "";
}

// ============================================================
// HTML PAGE FOR DISCORD EMBED
// ============================================================

function htmlPage(data) {
  const { sourceUrl, videoUrl, authorName, description, image } = data;

  const displayTitle = authorName || "Facebook Video";
  const displayDescription = description || "Facebook Reel/Video";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(displayTitle)}</title>

<!-- Discord Rich Embed Meta Tags -->
<meta property="og:site_name" content="C2Z Facebed">
<meta property="og:title" content="${escapeHtml(displayTitle)}">
<meta property="og:description" content="${escapeHtml(displayDescription)}">
<meta property="og:type" content="video.other">
<meta property="og:url" content="${escapeHtml(sourceUrl)}">

${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}

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
<meta name="twitter:description" content="${escapeHtml(displayDescription)}">
<meta name="twitter:image" content="${escapeHtml(image || "")}">
<meta name="twitter:player:stream" content="${escapeHtml(videoUrl)}">
<meta name="twitter:player:stream:content_type" content="video/mp4">
`
    : ""
}
</head>
<body>
<h1>${escapeHtml(displayTitle)}</h1>
<p>${escapeHtml(displayDescription)}</p>
</body>
</html>`;
}

function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

// ============================================================
// WORKER MAIN FETCH
// ============================================================

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/" && !requestUrl.searchParams.has("url")) {
      return new Response("C2Z Facebed Ready", { status: 200 });
    }

    const embeddedFacebookUrl = extractFacebookUrlFromPath(requestUrl);
    if (embeddedFacebookUrl) {
      if (!isBotRequest(request)) {
        return Response.redirect(embeddedFacebookUrl, 302);
      }

      try {
        const resolved = await resolveFacebookShare(embeddedFacebookUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html, extractVideoId(resolved.resolvedUrl));

        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, { headers: FACEBOOK_HEADERS });
          const videoHtml = await videoResp.text();
          videoUrl = extractFacebookVideoUrl(videoHtml, extractVideoId(resolved.resolvedUrl));
        }

        let discordVideoUrl = "";
        if (videoUrl) {
          discordVideoUrl =
            new URL("/video", requestUrl.origin).href +
            "?url=" +
            encodeURIComponent(embeddedFacebookUrl);
        }

        return new Response(
          htmlPage({
            sourceUrl: embeddedFacebookUrl,
            resolvedUrl: resolved.resolvedUrl,
            videoUrl: discordVideoUrl,
            authorName: resolved.authorName,
            description: resolved.description,
            image: resolved.image,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      } catch (error) {
        return errorResponse("Embedded URL resolver error", 500);
      }
    }

    if (isSupportedFacebookPath(requestUrl.pathname, requestUrl.search)) {
      const facebookUrl = "https://www.facebook.com" + requestUrl.pathname + requestUrl.search;

      if (!isBotRequest(request)) {
        return Response.redirect(facebookUrl, 302);
      }

      try {
        const resolved = await resolveFacebookShare(facebookUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html, extractVideoId(resolved.resolvedUrl));

        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, { headers: FACEBOOK_HEADERS });
          const videoHtml = await videoResp.text();
          videoUrl = extractFacebookVideoUrl(videoHtml, extractVideoId(resolved.resolvedUrl));
        }

        let discordVideoUrl = "";
        if (videoUrl) {
          discordVideoUrl =
            new URL("/video", requestUrl.origin).href +
            "?url=" +
            encodeURIComponent(facebookUrl);
        }

        return new Response(
          htmlPage({
            sourceUrl: facebookUrl,
            resolvedUrl: resolved.resolvedUrl,
            videoUrl: discordVideoUrl,
            authorName: resolved.authorName,
            description: resolved.description,
            image: resolved.image,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      } catch (error) {
        return errorResponse("Facebed route error", 500);
      }
    }

    const sourceUrl = requestUrl.searchParams.get("url");
    if (requestUrl.pathname === "/video" && sourceUrl) {
      let facebookUrl = decodeURIComponent(sourceUrl);
      try {
        const resolved = await resolveFacebookShare(facebookUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html, extractVideoId(resolved.resolvedUrl));

        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, { headers: FACEBOOK_HEADERS });
          const videoHtml = await videoResp.text();
          videoUrl = extractFacebookVideoUrl(videoHtml, extractVideoId(resolved.resolvedUrl));
        }

        if (!videoUrl) {
          return errorResponse("Video URL not found", 404);
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: videoUrl,
            "Cache-Control": "no-store, max-age=0",
          },
        });
      } catch (error) {
        return errorResponse("Internal resolver error", 500);
      }
    }

    return errorResponse("Route not found", 404);
  },
};