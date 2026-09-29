const FACEBOOK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " + "AppleWebKit/537.36 (KHTML, like Gecko) " + "Chrome/146.0.0.0 Safari/537.36";

const FACEBOOK_HEADERS = {
  "User-Agent": FACEBOOK_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value) {
  if (!value) return "";
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
      const codePoint = parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&#([0-9]+);?/g, (_, decimal) => {
      const codePoint = parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function decodeEscapedUrl(value) {
  if (!value) return "";
  let result = String(value);
  result = result
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return decodeHtmlEntities(result);
}

function isFacebookUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "facebook.com" || host === "www.facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch";
  } catch {
    return false;
  }
}

function isInstagramUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "instagram.com" || host === "www.instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am";
  } catch {
    return false;
  }
}

function isSupportedUrl(value) {
  return isFacebookUrl(value) || isInstagramUrl(value);
}

function isSupportedInstagramPath(pathname) {
  const path = pathname.replace(/\/+$/, "");
  return /^\/(p|reel|reels|tv)\/[^/]+$/i.test(path);
}

async function resolveInstagramEmbed(igUrl) {
  try {
    const parsed = new URL(igUrl);
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    const ddUrl = "https://www.ddinstagram.com" + cleanPath;

    const response = await fetch(ddUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = await response.text();
    const finalUrl = response.url || ddUrl;

    const title = getMeta(html, "og:title") || getMeta(html, "twitter:title") || "Instagram Post";

    const description = getMeta(html, "og:description") || getMeta(html, "description") || "Instagram content converted by C2Z";

    const image = getMeta(html, "og:image") || getMeta(html, "twitter:image") || "";

    const videoUrl = getMeta(html, "og:video:secure_url") || getMeta(html, "og:video") || getMeta(html, "twitter:player:stream") || "";

    const canonical = makeAbsoluteUrl(getCanonical(html), finalUrl) || getMeta(html, "og:url") || "";

    return {
      title,
      description,
      image,
      images: image ? [image] : [],
      videoUrl,
      canonical,
      finalUrl,
    };
  } catch {
    return {
      title: "Instagram Post",
      description: "Instagram content converted by C2Z",
      image: "",
      images: [],
      videoUrl: "",
      canonical: "",
      finalUrl: "",
    };
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
  const patterns = [new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"), new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i")];
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
  if (match?.[1]) {
    return decodeHtmlEntities(match[1]);
  }
  const reversed = html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (reversed?.[1]) {
    return decodeHtmlEntities(reversed[1]);
  }
  return "";
}

function looksLikePostUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!/facebook\.com$/i.test(url.hostname) && !/\.facebook\.com$/i.test(url.hostname)) {
      return false;
    }
    return /\/videos?\//i.test(url.pathname) || /\/reel\//i.test(url.pathname) || /\/reels\//i.test(url.pathname) || /\/posts?\//i.test(url.pathname) || /\/watch/i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractFacebookOwnerName(html) {
  if (!html) return "";
  const patterns = [/"short_form_video_context"\s*:\s*\{[\s\S]{0,10000}?"video_owner"\s*:\s*\{[\s\S]{0,4000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i, /"video_owner"\s*:\s*\{[\s\S]{0,4000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i, /"videoOwner"\s*:\s*\{[\s\S]{0,4000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i, /"owner"\s*:\s*\{[\s\S]{0,2500}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i, /"actor"\s*:\s*\{[\s\S]{0,2500}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i];
  for (const regex of patterns) {
    const match = html.match(regex);
    if (!match?.[1]) continue;
    const name = decodeEscapedUrl(match[1]).trim();
    if (name && name.length < 200 && name !== "Facebook Content") {
      return name;
    }
  }
  return "";
}

function extractFacebookImages(html, baseUrl = "") {
  const images = [];
  const seen = new Set();
  if (!html) return images;

  function addImage(value) {
    if (!value) return;
    let url = decodeEscapedUrl(value);
    if (!url) return;
    url = makeAbsoluteUrl(url, baseUrl);
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (!/(fbcdn\.net|facebook\.com|fbsbx\.com)/i.test(url)) return;
    if (seen.has(url)) return;

    seen.add(url);
    images.push(url);
  }

  const ogImageRegex = /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  let match;
  while ((match = ogImageRegex.exec(html)) !== null) {
    addImage(match[1]);
  }

  const imageUriRegex = /"image"\s*:\s*\{\s*"uri"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  while ((match = imageUriRegex.exec(html)) !== null) {
    addImage(match[1]);
  }

  const viewerImageRegex = /"viewer_image"\s*:\s*\{[\s\S]{0,1000}?"uri"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  while ((match = viewerImageRegex.exec(html)) !== null) {
    addImage(match[1]);
  }

  return images.slice(0, 10);
}

function extractFacebookStats(html) {
  const stats = {
    reactions: "",
    comments: "",
    shares: "",
    views: "",
    creationTime: "",
  };

  if (typeof html !== "string" || !html) return stats;

  try {
    const source = html;
    const patterns = {
      reactions: [/"reaction_count"\s*:\s*\{\s*"count"\s*:\s*"?(\d+)"?/i, /"reactionCount"\s*:\s*"?(\d+)"?/i, /"total_reaction_count"\s*:\s*"?(\d+)"?/i, /"reaction_count"\s*:\s*"?(\d+)"?/i],
      comments: [/"comment_count"\s*:\s*\{\s*"total_count"\s*:\s*"?(\d+)"?/i, /"commentCount"\s*:\s*"?(\d+)"?/i, /"total_comment_count"\s*:\s*"?(\d+)"?/i, /"comment_count"\s*:\s*"?(\d+)"?/i],
      shares: [/"share_count"\s*:\s*\{\s*"count"\s*:\s*"?(\d+)"?/i, /"shareCount"\s*:\s*"?(\d+)"?/i, /"total_share_count"\s*:\s*"?(\d+)"?/i, /"share_count"\s*:\s*"?(\d+)"?/i],
      views: [/"view_count"\s*:\s*\{\s*"count"\s*:\s*"?(\d+)"?/i, /"viewCount"\s*:\s*"?(\d+)"?/i, /"play_count"\s*:\s*"?(\d+)"?/i, /"video_view_count"\s*:\s*"?(\d+)"?/i],
      creationTime: [/"creation_time"\s*:\s*"?(\d+)"?/i, /"publish_time"\s*:\s*"?(\d+)"?/i],
    };

    for (const [key, regexList] of Object.entries(patterns)) {
      for (const regex of regexList) {
        const match = regex.exec(source);
        if (!match || !match[1]) continue;

        if (key === "creationTime") {
          let timestamp = Number(match[1]);
          if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
          if (timestamp > 100000000000) timestamp = Math.floor(timestamp / 1000);

          try {
            const date = new Date(timestamp * 1000);
            if (!Number.isNaN(date.getTime())) {
              stats.creationTime = date.toISOString();
            }
          } catch {}
        } else {
          stats[key] = String(match[1]);
        }
        break;
      }
    }
  } catch {}

  return stats;
}

function formatTestNumber(value) {
  if (value === null || value === undefined || value === "") return "ไม่พบข้อมูล";
  try {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return number.toLocaleString("en-US");
  } catch {
    return String(value);
  }
}

function renderTestPage({ inputUrl = "", resolvedUrl = "", title = "", authorName = "", description = "", image = "", stats = {}, error = "" }) {
  const safeStats = stats && typeof stats === "object" ? stats : {};
  const safeInputUrl = inputUrl == null ? "" : String(inputUrl);
  const safeResolvedUrl = resolvedUrl == null ? "" : String(resolvedUrl);
  const safeTitle = title == null ? "" : String(title);
  const safeAuthorName = authorName == null ? "" : String(authorName);
  const safeDescription = description == null ? "" : String(description);
  const safeImage = image == null ? "" : String(image);
  const safeError = error == null ? "" : String(error);

  const pageTitle = safeAuthorName || safeTitle || "C2Z Facebed Test";
  const pageDescription = safeDescription || (safeAuthorName ? `โพสต์ Facebook โดย ${safeAuthorName}` : "ทดสอบการดึงข้อมูลจาก Facebook ด้วย C2Z Facebed");

  const statRows = [
    ["ชื่อคนโพสต์", safeAuthorName || "ไม่พบข้อมูล"],
    ["ชื่อโพสต์ / วิดีโอ", safeTitle || "ไม่พบข้อมูล"],
    ["ถูกใจ / ปฏิกิริยา", formatTestNumber(safeStats.reactions)],
    ["ความคิดเห็น", formatTestNumber(safeStats.comments)],
    ["แชร์", formatTestNumber(safeStats.shares)],
    ["ยอดดู", formatTestNumber(safeStats.views)],
    ["เวลาสร้างโพสต์", safeStats.creationTime ? String(safeStats.creationTime) : "ไม่พบข้อมูล"],
    ["URL ที่ส่ง", safeInputUrl || "—"],
    ["URL ที่ Resolve ได้", safeResolvedUrl || "ไม่พบข้อมูล"],
  ];

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(pageDescription)}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(pageDescription)}">
  <meta property="og:type" content="website">
  ${safeImage ? `<meta property="og:image" content="${escapeHtml(safeImage)}">` : ""}
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111318; color: #f3f4f6; }
    .wrap { width: min(1000px, calc(100% - 32px)); margin: 40px auto; }
    .card { background: #1b1e24; border: 1px solid #30343d; border-radius: 16px; padding: 24px; margin-bottom: 18px; box-shadow: 0 8px 30px rgba(0, 0, 0, .25); }
    h1 { margin: 0 0 8px; font-size: 26px; }
    .muted { color: #9ca3af; }
    form { display: flex; gap: 10px; margin-top: 20px; }
    input { flex: 1; min-width: 0; background: #0f1115; border: 1px solid #3a3f49; border-radius: 10px; color: #fff; padding: 12px 14px; font-size: 14px; outline: none; }
    input:focus { border-color: #5865f2; }
    button { border: 0; border-radius: 10px; padding: 12px 18px; background: #5865f2; color: white; font-weight: 700; cursor: pointer; }
    .preview { display: grid; grid-template-columns: 240px 1fr; gap: 20px; align-items: start; }
    .preview img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 12px; background: #0f1115; }
    .stats { width: 100%; border-collapse: collapse; }
    .stats td { padding: 11px 8px; border-bottom: 1px solid #30343d; vertical-align: top; word-break: break-word; }
    .stats td:first-child { width: 190px; color: #9ca3af; }
    .error { background: #3a171b; border: 1px solid #7f1d1d; color: #fecaca; border-radius: 10px; padding: 14px; margin-top: 18px; }
    @media (max-width: 700px) {
      form, .preview { display: block; }
      button { width: 100%; margin-top: 10px; }
      .preview img { margin-bottom: 16px; }
      .stats td:first-child { width: 130px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>🧪 C2Z Facebed Test</h1>
      <div class="muted">ทดสอบการดึงข้อมูลจาก Facebook โดยไม่กระทบหน้า Facebed อื่น</div>
      <form method="GET">
        <input type="text" name="test" value="${escapeHtml(safeInputUrl)}" placeholder="https://www.facebook.com/reel/..." autocomplete="off">
        <button type="submit">Test</button>
      </form>
      ${safeError ? `<div class="error">${escapeHtml(safeError)}</div>` : ""}
    </div>
    ${
      safeInputUrl && !safeError
        ? `
    <div class="card">
      <div class="preview">
        ${safeImage ? `<img src="${escapeHtml(safeImage)}" alt="">` : `<div class="muted">ไม่มีรูป Preview</div>`}
        <div>
          <h2 style="margin-top:0">${escapeHtml(safeAuthorName || safeTitle || "Facebook Content")}</h2>
          ${safeAuthorName ? `<div class="muted">โพสต์โดย: <strong>${escapeHtml(safeAuthorName)}</strong></div>` : ""}
          ${safeDescription ? `<p>${escapeHtml(safeDescription)}</p>` : ""}
        </div>
      </div>
    </div>
    <div class="card">
      <h2>รายละเอียด</h2>
      <table class="stats">
        <tbody>
          ${statRows
            .map(
              ([label, value]) => `
          <tr>
            <td>${escapeHtml(String(label))}</td>
            <td>${escapeHtml(String(value))}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`
        : ""
    }
  </div>
</body>
</html>`;
}

function normalizeFacebookGroupMultiPermalink(pathname, search = "") {
  const path = pathname.replace(/\/+$/, "");
  const params = new URLSearchParams(search);
  const match = path.match(/^\/groups\/([^/]+)$/i);
  if (!match) return "";

  const postId = params.get("multi_permalinks");
  if (!postId || !/^\d+$/.test(postId)) return "";

  return "https://www.facebook.com/groups/" + match[1] + "/permalink/" + postId;
}

function isSupportedFacebookPath(pathname, search = "") {
  const path = pathname.replace(/\/+$/, "");
  const params = new URLSearchParams(search);
  if (/^\/share\/(r|p|v|[^/]+)(\/[^/]+)?$/i.test(path)) return true;
  if (/^\/[^/]+\/posts\/[^/]+$/i.test(path)) return true;
  if (/^\/[^/]+\/videos\/\d+$/i.test(path)) return true;
  if (/^\/[^/]+\/videos\/pcb\.[^/]+\/\d+$/i.test(path)) return true;
  if (/^\/groups\/[^/]+\/posts\/[^/]+$/i.test(path)) return true;
  if (/^\/groups\/[^/]+$/i.test(path) && params.has("multi_permalinks")) return true;
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

  try {
    const facebookParsed = new URL(facebookUrl);
    const normalized = normalizeFacebookGroupMultiPermalink(facebookParsed.pathname, facebookParsed.search);
    if (normalized) return normalized;
  } catch {}

  return facebookUrl;
}

function inspectFacebookPage(html, baseUrl) {
  const canonical = makeAbsoluteUrl(getCanonical(html), baseUrl);
  const ogUrl = makeAbsoluteUrl(getMeta(html, "og:url"), baseUrl);
  const originalTitle = getMeta(html, "og:title") || getMeta(html, "twitter:title") || "";
  const authorName = extractFacebookOwnerName(html);
  const title = authorName || originalTitle || "";
  const description = getMeta(html, "og:description") || getMeta(html, "description") || "";
  const image = getMeta(html, "og:image") || getMeta(html, "twitter:image") || "";
  const images = extractFacebookImages(html, baseUrl);

  return { canonical, ogUrl, title, authorName, description, image, images };
}

async function resolveFacebookShare(sourceUrl) {
  try {
    const headResponse = await fetch(sourceUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: FACEBOOK_HEADERS,
    });
    const headFinalUrl = headResponse.url || "";
    if (headFinalUrl && !isSharePath(headFinalUrl) && !isLoginPath(headFinalUrl) && looksLikePostUrl(headFinalUrl)) {
      try {
        const detailResponse = await fetch(headFinalUrl, {
          method: "GET",
          redirect: "follow",
          headers: FACEBOOK_HEADERS,
        });
        const detailHtml = await detailResponse.text();
        const detailFinalUrl = detailResponse.url || headFinalUrl;
        const pageInfo = inspectFacebookPage(detailHtml, detailFinalUrl);
        return {
          success: true,
          resolvedUrl: pageInfo.canonical || pageInfo.ogUrl || detailFinalUrl,
          html: detailHtml,
          finalUrl: detailFinalUrl,
          title: pageInfo.title,
          authorName: pageInfo.authorName,
          description: pageInfo.description,
          image: pageInfo.image,
          images: pageInfo.images,
          reason: "HEAD redirect + GET metadata",
        };
      } catch {}
    }
  } catch (error) {}

  const response = await fetch(sourceUrl, {
    method: "GET",
    redirect: "follow",
    headers: FACEBOOK_HEADERS,
  });
  const html = await response.text();
  const finalUrl = response.url || sourceUrl;
  const pageInfo = inspectFacebookPage(html, finalUrl);
  const declaredUrl = pageInfo.canonical || pageInfo.ogUrl || "";

  if (declaredUrl && !isSharePath(declaredUrl) && !isLoginPath(declaredUrl)) {
    return {
      success: true,
      resolvedUrl: declaredUrl,
      html,
      finalUrl,
      title: pageInfo.title,
      authorName: pageInfo.authorName,
      description: pageInfo.description,
      image: pageInfo.image,
      images: pageInfo.images,
      reason: "canonical/og:url resolved",
    };
  }

  if (finalUrl && !isSharePath(finalUrl) && !isLoginPath(finalUrl) && looksLikePostUrl(finalUrl)) {
    return {
      success: true,
      resolvedUrl: finalUrl,
      html,
      finalUrl,
      title: pageInfo.title,
      authorName: pageInfo.authorName,
      description: pageInfo.description,
      image: pageInfo.image,
      images: pageInfo.images,
      reason: "final URL resolved",
    };
  }

  return {
    success: false,
    resolvedUrl: "",
    html,
    finalUrl,
    title: pageInfo.title,
    authorName: pageInfo.authorName,
    description: pageInfo.description,
    image: pageInfo.image,
    images: pageInfo.images,
    reason: isLoginPath(finalUrl) ? "Facebook login page" : "Could not resolve Facebook URL",
  };
}

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
    if (key === "browser_native_hd_url" || key === "browser_native_sd_url" || key === "browserNativeHdUrl" || key === "browserNativeSdUrl" || key === "videoDeliveryLegacyFields") {
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

function htmlPage(data) {
  const { sourceUrl, videoUrl, title, authorName, description, image, images = [] } = data;
  const safeTitle = authorName || title || "Social Media Content";
  const safeDescription = description || "Content converted by C2Z";

  function normalizeImageUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }

  const allImages = [];
  const seenNormalized = new Set();

  for (const imgUrl of [image, ...(Array.isArray(images) ? images : [])].filter(Boolean)) {
    const normalized = normalizeImageUrl(imgUrl);
    if (!seenNormalized.has(normalized)) {
      seenNormalized.add(normalized);
      allImages.push(imgUrl);
    }
  }

  const finalImages = videoUrl ? (allImages[0] ? [allImages[0]] : []) : allImages.length > 0 ? allImages.slice(0, 10) : [];

  const ogImagesHtml = finalImages
    .map(
      (img) => `<meta property="og:image" content="${escapeHtml(img)}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">`,
    )
    .join("\n");

  const primaryImage = finalImages[0] || "";

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(safeTitle)}</title>
<meta name="theme-color" content="#1877F2">
<meta name="viewport" content="width=device-width, initial-scale=1">

<!-- Standard HTML metadata -->
<meta name="description" content="${escapeHtml(safeDescription)}">

<!-- Open Graph -->
<meta property="og:site_name" content="Fix Embed by C2Z">
<meta property="og:title" content="${escapeHtml(safeTitle)}">
<meta property="og:description" content="${escapeHtml(safeDescription)}">
<meta property="og:type" content="${videoUrl ? "video.other" : "article"}">
<meta property="og:url" content="${escapeHtml(sourceUrl || "")}">

${ogImagesHtml}

<!-- Twitter / Discord Large Card -->
<meta name="twitter:card" content="${videoUrl ? "player" : "summary_large_image"}">
<meta name="twitter:title" content="${escapeHtml(safeTitle)}">
<meta name="twitter:description" content="${escapeHtml(safeDescription)}">
${primaryImage ? `<meta name="twitter:image" content="${escapeHtml(primaryImage)}">` : ""}

${
  videoUrl
    ? `<!-- Open Graph Video -->
<meta property="og:video" content="${escapeHtml(videoUrl)}">
<meta property="og:video:url" content="${escapeHtml(videoUrl)}">
<meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="1280">
<meta property="og:video:height" content="720">

<!-- Twitter Player Specs -->
<meta name="twitter:player:stream" content="${escapeHtml(videoUrl)}">
<meta name="twitter:player:stream:content_type" content="video/mp4">
<meta name="twitter:player:width" content="1280">
<meta name="twitter:player:height" content="720">`
    : ""
}
</head>

<body>
<h1>${escapeHtml(safeTitle)}</h1>
<p>${escapeHtml(safeDescription)}</p>
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

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (requestUrl.searchParams.has("test")) {
      const testValue = requestUrl.searchParams.get("test")?.trim() || "";
      if (!testValue) {
        return new Response(renderTestPage({}), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }
      if (!isFacebookUrl(testValue)) {
        return new Response(
          renderTestPage({
            inputUrl: testValue,
            error: "URL นี้ไม่ใช่ Facebook URL ที่รองรับ",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      }
      try {
        const resolved = await resolveFacebookShare(testValue);
        let html = resolved.html || "";
        let finalUrl = resolved.resolvedUrl || resolved.finalUrl || testValue;
        if (!html && finalUrl) {
          const detailResponse = await fetch(finalUrl, {
            method: "GET",
            redirect: "follow",
            headers: FACEBOOK_HEADERS,
          });
          html = await detailResponse.text();
          finalUrl = detailResponse.url || finalUrl;
        }
        const pageInfo = inspectFacebookPage(html, finalUrl);
        const stats = extractFacebookStats(html);
        const authorName = pageInfo.authorName || resolved.authorName || "";

        return new Response(
          renderTestPage({
            inputUrl: testValue,
            resolvedUrl: pageInfo.canonical || pageInfo.ogUrl || resolved.resolvedUrl || finalUrl,
            title: authorName || pageInfo.title || resolved.title || "",
            authorName,
            description: pageInfo.description || resolved.description || "",
            image: pageInfo.image || resolved.image || "",
            stats,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      } catch (error) {
        return new Response(
          renderTestPage({
            inputUrl: testValue,
            error: error?.message || "เกิดข้อผิดพลาดระหว่างดึงข้อมูล Facebook",
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      }
    }

    const ua = (request.headers.get("user-agent") || "").toLowerCase();
    const isDiscordOrBot = ua.includes("discordbot") || ua.includes("telegrambot") || ua.includes("twitterbot") || ua.includes("facebookexternalhit");

    if (requestUrl.pathname === "/" && !requestUrl.searchParams.has("url")) {
      return new Response(
        `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Facebook & IG Fix Embed by C2Z</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at top, #302b63 0%, #24243e 45%, #151515 100%); color: #ffffff; font-family: Arial, Helvetica, sans-serif; }
    .container { width: min(680px, calc(100% - 32px)); padding: 32px; background: rgba(20, 20, 20, 0.92); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); }
    .logo { text-align: center; font-size: 32px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { text-align: center; color: #aaa; margin-bottom: 28px; }
    label { display: block; margin-bottom: 8px; font-weight: 600; }
    .input-row { display: flex; gap: 10px; }
    input { flex: 1; min-width: 0; padding: 14px 16px; border: 1px solid #444; border-radius: 10px; background: #111; color: #fff; font-size: 15px; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #667eea; }
    button { border: 0; border-radius: 10px; padding: 14px 20px; background: #667eea; color: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.25s ease; }
    button:hover { background: #7289da; }
    button.copied { background: #22c55e !important; transform: scale(1.05); }
    .result { display: none; margin-top: 24px; animation: fadeIn 0.3s ease; }
    .result-title { margin-bottom: 8px; font-weight: 600; }
    .result input { width: 100%; background: #0d0d0d; border-color: #333; }
    .error { display: none; margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: rgba(255, 70, 70, 0.12); color: #ff8585; }
    .hint { margin-top: 22px; color: #888; font-size: 13px; line-height: 1.6; text-align: center; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 600px) { .container { padding: 24px; } .input-row { flex-direction: column; } button { width: 100%; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">FB & IG Fix Embed</div>
    <div class="subtitle">สร้างตัวฝังคลิป Facebook และ Instagram บน Discord</div>
    <form id="form">
      <label for="urlInput">Facebook หรือ Instagram URL</label>
      <div class="input-row">
        <input id="urlInput" type="url" placeholder="https://www.facebook.com/... หรือ https://www.instagram.com/p/..." autocomplete="off" required>
        <button id="submitBtn" type="submit">สร้างลิงก์</button>
      </div>
    </form>
    <div id="error" class="error"></div>
    <div id="result" class="result">
      <div class="result-title">Fix Embed Link</div>
      <input id="resultUrl" type="text" readonly>
    </div>
    <div class="hint">วางลิงก์ FB หรือ IG แล้วกดสร้างลิงก์<br>ระบบจะเปลี่ยนเป็นลิงก์ C2Z และคัดลอกให้อัตโนมัติ</div>
  </div>

  <script>
    const form = document.getElementById("form");
    const input = document.getElementById("urlInput");
    const result = document.getElementById("result");
    const resultUrl = document.getElementById("resultUrl");
    const error = document.getElementById("error");
    const submitBtn = document.getElementById("submitBtn");
    let hideResultTimer = null;

    function isFacebookUrl(value) {
      try { const host = new URL(value).hostname.toLowerCase(); return host === "facebook.com" || host === "www.facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch"; } catch { return false; }
    }
    function isInstagramUrl(value) {
      try { const host = new URL(value).hostname.toLowerCase(); return host === "instagram.com" || host === "www.instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am"; } catch { return false; }
    }
    function isSupportedUrl(value) { return isFacebookUrl(value) || isInstagramUrl(value); }

    async function copyToClipboard(text) {
      try { await navigator.clipboard.writeText(text); } catch { resultUrl.select(); document.execCommand("copy"); }
    }

    form.addEventListener("submit", async function(event) {
      event.preventDefault();
      const value = input.value.trim();
      error.style.display = "none"; result.style.display = "none";
      if (hideResultTimer) clearTimeout(hideResultTimer);

      if (!isSupportedUrl(value)) {
        error.textContent = "กรุณาใส่ลิงก์ Facebook หรือ Instagram ที่ถูกต้อง";
        error.style.display = "block"; return;
      }

      try {
        const targetUrl = new URL(value);

let c2zUrl = window.location.origin + targetUrl.pathname;

// ========================================
// Instagram
// ตัด Query / Tracking ออกทั้งหมด
// เช่น ?utm_source=...&stkn=...
// ========================================

if (isInstagramUrl(value)) {
  c2zUrl =
    window.location.origin +
    targetUrl.pathname.replace(/\/+$/, "") +
    "/";
}

// ========================================
// Facebook
// ยังเก็บ Query เอาไว้ เพราะ Facebook
// บางรูปแบบต้องใช้ query เช่น multi_permalinks
// ========================================

if (isFacebookUrl(value)) {
  c2zUrl =
    window.location.origin +
    targetUrl.pathname +
    targetUrl.search;

  const groupMatch =
    targetUrl.pathname.match(/^\/groups\/([^/]+)\/?$/i);

  const multiPermalink =
    targetUrl.searchParams.get("multi_permalinks");

  if (
    groupMatch &&
    multiPermalink &&
    /^\d+$/.test(multiPermalink)
  ) {
    c2zUrl =
      window.location.origin +
      "/groups/" +
      groupMatch[1] +
      "/permalink/" +
      multiPermalink;
  }
}

        resultUrl.value = c2zUrl;
        result.style.display = "block";
        await copyToClipboard(c2zUrl);
        input.value = "";

        hideResultTimer = setTimeout(() => { result.style.display = "none"; }, 5000);

        const originalText = submitBtn.textContent;
        submitBtn.textContent = "✓ คัดลอกลิงก์แล้ว!";
        submitBtn.classList.add("copied");
        setTimeout(() => { submitBtn.textContent = originalText; submitBtn.classList.remove("copied"); }, 2000);
      } catch {
        error.textContent = "ไม่สามารถสร้างลิงก์ได้"; error.style.display = "block";
      }
    });
  </script>
</body>
</html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const embeddedFacebookUrl = extractFacebookUrlFromPath(requestUrl);
    let normalizedEmbeddedFacebookUrl = embeddedFacebookUrl;
    if (embeddedFacebookUrl) {
      try {
        const embeddedUrl = new URL(embeddedFacebookUrl);
        const normalized = normalizeFacebookGroupMultiPermalink(embeddedUrl.pathname, embeddedUrl.search);
        if (normalized) normalizedEmbeddedFacebookUrl = normalized;
      } catch {}
    }

    if (embeddedFacebookUrl) {
      if (!isDiscordOrBot) {
        return Response.redirect(normalizedEmbeddedFacebookUrl, 302);
      }
      try {
        const resolved = await resolveFacebookShare(normalizedEmbeddedFacebookUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html, extractVideoId(resolved.resolvedUrl));
        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, {
            headers: FACEBOOK_HEADERS,
          });
          const videoHtml = await videoResp.text();
          videoUrl = extractFacebookVideoUrl(videoHtml, extractVideoId(resolved.resolvedUrl));
        }
        let discordVideoUrl = "";
        if (videoUrl) {
          discordVideoUrl = new URL("/video", requestUrl.origin).href + "?url=" + encodeURIComponent(normalizedEmbeddedFacebookUrl);
        }
        return new Response(
          htmlPage({
            sourceUrl: normalizedEmbeddedFacebookUrl,
            resolvedUrl: resolved.resolvedUrl,
            videoUrl: discordVideoUrl,
            title: resolved.title,
            authorName: resolved.authorName,
            description: resolved.description,
            image: resolved.image,
            images: resolved.images,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      } catch (error) {
        return errorResponse("Embedded URL resolver error", 500);
      }
    }

    if (isSupportedFacebookPath(requestUrl.pathname, requestUrl.search)) {
      const normalizedGroupUrl = normalizeFacebookGroupMultiPermalink(requestUrl.pathname, requestUrl.search);
      const facebookUrl = normalizedGroupUrl || "https://www.facebook.com" + requestUrl.pathname + requestUrl.search;

      if (!isDiscordOrBot) {
        return Response.redirect(facebookUrl, 302);
      }
      try {
        const resolved = await resolveFacebookShare(facebookUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html, extractVideoId(resolved.resolvedUrl));
        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, {
            headers: FACEBOOK_HEADERS,
          });
          const videoHtml = await videoResp.text();
          videoUrl = extractFacebookVideoUrl(videoHtml, extractVideoId(resolved.resolvedUrl));
        }
        let discordVideoUrl = "";
        if (videoUrl) {
          discordVideoUrl = new URL("/video", requestUrl.origin).href + "?url=" + encodeURIComponent(facebookUrl);
        }
        return new Response(
          htmlPage({
            sourceUrl: facebookUrl,
            resolvedUrl: resolved.resolvedUrl,
            videoUrl: discordVideoUrl,
            title: resolved.title,
            authorName: resolved.authorName,
            description: resolved.description,
            image: resolved.image,
            images: resolved.images,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      } catch (error) {
        return errorResponse("Facebed route error", 500);
      }
    }

    const sourceUrl = requestUrl.searchParams.get("url");
    if (requestUrl.pathname === "/video" && sourceUrl) {
      const facebookUrl = decodeURIComponent(sourceUrl);
      try {
        const resolved = await resolveFacebookShare(facebookUrl);
        let videoUrl = extractFacebookVideoUrl(resolved.html, extractVideoId(resolved.resolvedUrl));
        if (!videoUrl && resolved.resolvedUrl) {
          const videoResp = await fetch(resolved.resolvedUrl, {
            headers: FACEBOOK_HEADERS,
          });
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

    if (isSupportedInstagramPath(requestUrl.pathname)) {
      const igUrl = "https://www.instagram.com" + requestUrl.pathname + requestUrl.search;

      // คนเปิดจาก Browser → ส่งกลับ Instagram ตามปกติ
      if (!isDiscordOrBot) {
        return Response.redirect(igUrl, 302);
      }

      try {
        const igData = await resolveInstagramEmbed(igUrl);

        // ถ้าเป็น Reel / Video Post
        // ให้ Discord เรียกผ่าน C2Z ก่อน
        let discordVideoUrl = "";

        if (igData.videoUrl) {
          discordVideoUrl = new URL("/ig-video", requestUrl.origin).href + "?url=" + encodeURIComponent(igUrl);
        }

        return new Response(
          htmlPage({
            sourceUrl: igUrl,
            videoUrl: discordVideoUrl,
            title: igData.title,
            description: igData.description,
            image: igData.image,
            images: igData.images,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=UTF-8",
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      } catch (error) {
        return errorResponse("Instagram route error", 500);
      }
    }

    // ========================================
    // Instagram Video Resolver
    // ========================================

    if (requestUrl.pathname === "/ig-video") {
      const sourceUrl = requestUrl.searchParams.get("url");

      if (!sourceUrl || !isInstagramUrl(sourceUrl)) {
        return errorResponse("Invalid Instagram URL", 400);
      }

      try {
        const igData = await resolveInstagramEmbed(sourceUrl);

        if (!igData.videoUrl) {
          return errorResponse("Instagram video URL not found", 404);
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: igData.videoUrl,
            "Cache-Control": "no-store, max-age=0",
          },
        });
      } catch (error) {
        return errorResponse("Instagram video resolver error", 500);
      }
    }

    return errorResponse("Route not found", 404);
  },
};
