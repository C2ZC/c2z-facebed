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

// Check if request comes from Discord, Telegram, or social media crawlers
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
// INSPECT PAGE
// ============================================================

function inspectFacebookPage(html) {
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

  let authorName = "Facebook Video";
  let contentTitle = rawTitle;

  if (rawTitle.includes(" | Facebook")) {
    authorName = rawTitle.replace(" | Facebook", "").trim();
    contentTitle = description || authorName;
  } else if (rawTitle.includes(" - ")) {
    const parts = rawTitle.split(" - ");
    authorName = parts[0].trim();
    contentTitle = parts.slice(1).join(" - ").trim();
  } else if (rawTitle) {
    authorName = rawTitle;
  }

  let creationTime = "";
  let reactionCount = "";
  let commentCount = "";
  let shareCount = "";

  try {
    const timeMatch = html.match(/"publish_time"\s*:\s*(\d+)/i) || html.match(/"creation_time"\s*:\s*(\d+)/i);
    if (timeMatch?.[1]) {
      const date = new Date(parseInt(timeMatch[1], 10) * 1000);
      creationTime = date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
    }

    const reactMatch = html.match(/"reaction_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i);
    if (reactMatch?.[1]) reactionCount = reactMatch[1];

    const commentMatch = html.match(/"comment_count"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/i);
    if (commentMatch?.[1]) commentCount = commentMatch[1];

    const shareMatch = html.match(/"share_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i);
    if (shareMatch?.[1]) shareCount = shareMatch[1];
  } catch {}

  return {
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
  const finalUrl = response.url || sourceUrl;
  const pageInfo = inspectFacebookPage(html);

  return {
    success: true,
    resolvedUrl: finalUrl,
    html,
    authorName: pageInfo.authorName,
    title: pageInfo.title,
    description: pageInfo.description,
    image: pageInfo.image,
    creationTime: pageInfo.creationTime,
    reactionCount: pageInfo.reactionCount,
    commentCount: pageInfo.commentCount,
    shareCount: pageInfo.shareCount,
  };
}

// ============================================================
// EXTRACT VIDEO URL
// ============================================================

function extractFacebookVideoUrl(html) {
  if (!html) return "";

  const candidates = [];
  const jsonScriptRegex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonScriptRegex.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const json = JSON.parse(raw);
      walkVideoNodes(json, candidates);
    } catch {}
  }

  candidates.sort((a, b) => (b.isHd === a.isHd ? 0 : b.isHd ? 1 : -1));

  for (const candidate of candidates) {
    if (!candidate.url) continue;
    const decoded = decodeEscapedUrl(candidate.url);
    if (/^https?:\/\//i.test(decoded) && (/\.(mp4|m4v)(?:[?#]|$)/i.test(decoded) || /(?:video|fbcdn|scontent)/i.test(decoded))) {
      return decoded;
    }
  }

  return "";
}

function walkVideoNodes(node, candidates, depth = 0) {
  if (!node || depth > 25) return;
  if (Array.isArray(node)) {
    for (const item of node) walkVideoNodes(item, candidates, depth + 1);
    return;
  }
  if (typeof node !== "object") return;

  const hd = node.browser_native_hd_url || node.browserNativeHdUrl;
  const sd = node.browser_native_sd_url || node.browserNativeSdUrl;

  if (hd) candidates.push({ url: hd, isHd: true });
  if (sd) candidates.push({ url: sd, isHd: false });

  for (const [key, value] of Object.entries(node)) {
    if (key.includes("browser_native") || key.includes("browserNative")) continue;
    walkVideoNodes(value, candidates, depth + 1);
  }
}

// ============================================================
// HTML GENERATOR FOR DISCORD EMBED
// ============================================================

function htmlPage(data) {
  const {
    sourceUrl,
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

  const siteName = authorName && authorName !== "Facebook Video" ? authorName : "C2Z Facebed";
  const displayTitle = title || "Facebook Video";

  let statsList = [];
  if (creationTime) statsList.push(`🕒 ${creationTime}`);

  let subStats = [];
  if (reactionCount) subStats.push(`💖 ${reactionCount}`);
  if (commentCount) subStats.push(`💬 ${commentCount}`);
  if (shareCount) subStats.push(`🔄 ${shareCount}`);

  if (subStats.length > 0) {
    statsList.push(subStats.join(" · "));
  }

  let embedDescription = statsList.join("\n");
  if (!embedDescription && description) {
    embedDescription = description;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(displayTitle)}</title>

<!-- Discord Rich Embed Meta Tags -->
<meta property="og:site_name" content="${escapeHtml(siteName)}">
<meta property="og:title" content="${escapeHtml(displayTitle)}">
<meta property="og:description" content="${escapeHtml(embedDescription)}">
<meta property="og:type" content="video.other">
<meta property="og:url" content="${escapeHtml(sourceUrl)}">
<meta name="theme-color" content="#2160C4">

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
<meta name="twitter:description" content="${escapeHtml(embedDescription)}">
<meta name="twitter:player:stream" content="${escapeHtml(videoUrl)}">
<meta name="twitter:player:stream:content_type" content="video/mp4">
`
    : ""
}
</head>
<body>
<h1>${escapeHtml(displayTitle)}</h1>
<p>${escapeHtml(embedDescription)}</p>
</body>
</html>`;
}

// ============================================================
// WORKER ENTRYPOINT
// ============================================================

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/" && !requestUrl.searchParams.has("url")) {
      return new Response("C2Z Facebed Online", { status: 200 });
    }

    async function handleRequest(targetFbUrl) {
      // 1. ถ้าคนจริงกดเข้าลิงก์ ให้ 302 Redirect ไปหน้า Facebook ทันที
      if (!isBotRequest(request)) {
        return Response.redirect(targetFbUrl, 302);
      }

      // 2. ถ้าเป็น Discordbot เข้ามาเก็บข้อมูล ให้ส่ง HTML Meta Tags สำหรับ Embed
      try {
        const resolved = await resolveFacebookShare(targetFbUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html);

        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, { headers: FACEBOOK_HEADERS });
          const videoHtml = await videoResp.text();
          videoUrl = extractFacebookVideoUrl(videoHtml);
        }

        let discordVideoUrl = "";
        if (videoUrl) {
          discordVideoUrl =
            new URL("/video", requestUrl.origin).href +
            "?url=" +
            encodeURIComponent(targetFbUrl);
        }

        return new Response(
          htmlPage({
            sourceUrl: targetFbUrl,
            videoUrl: discordVideoUrl,
            authorName: resolved.authorName,
            title: resolved.title,
            description: resolved.description,
            image: resolved.image,
            creationTime: resolved.creationTime,
            reactionCount: resolved.reactionCount,
            commentCount: resolved.commentCount,
            shareCount: resolved.shareCount,
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
        return Response.redirect(targetFbUrl, 302);
      }
    }

    // Direct Embedded URL
    const embeddedFacebookUrl = extractFacebookUrlFromPath(requestUrl);
    if (embeddedFacebookUrl) {
      return await handleRequest(embeddedFacebookUrl);
    }

    // Direct Path
    if (isSupportedFacebookPath(requestUrl.pathname, requestUrl.search)) {
      const facebookUrl = "https://www.facebook.com" + requestUrl.pathname + requestUrl.search;
      return await handleRequest(facebookUrl);
    }

    // Video Stream Endpoint
    const sourceUrl = requestUrl.searchParams.get("url");
    if (requestUrl.pathname === "/video" && sourceUrl) {
      let facebookUrl = decodeURIComponent(sourceUrl);
      try {
        const resolved = await resolveFacebookShare(facebookUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html);

        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, { headers: FACEBOOK_HEADERS });
          const videoHtml = await videoResp.text();
          videoUrl = extractFacebookVideoUrl(videoHtml);
        }

        if (!videoUrl) {
          return Response.redirect(facebookUrl, 302);
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: videoUrl,
            "Cache-Control": "no-store, max-age=0",
          },
        });
      } catch (error) {
        return Response.redirect(facebookUrl, 302);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};