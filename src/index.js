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

        if (
            !/facebook\.com$/i.test(url.hostname) &&
            !/\.facebook\.com$/i.test(url.hostname)
        ) {
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
// TEST PAGE DATA
// ============================================================

function extractFacebookStats(html) {
    const stats = {
        reactions: "",
        comments: "",
        shares: "",
        views: "",
        creationTime: "",
    };

    if (!html) return stats;

    const patterns = {
        reactions: [
            /"reaction_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /"reactionCount"\s*:\s*(\d+)/i,
            /"total_reaction_count"\s*:\s*(\d+)/i,
            /"reaction_count"\s*:\s*(\d+)/i,
        ],

        comments: [
            /"comment_count"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/i,
            /"commentCount"\s*:\s*(\d+)/i,
            /"total_comment_count"\s*:\s*(\d+)/i,
            /"comment_count"\s*:\s*(\d+)/i,
        ],

        shares: [
            /"share_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /"shareCount"\s*:\s*(\d+)/i,
            /"total_share_count"\s*:\s*(\d+)/i,
            /"share_count"\s*:\s*(\d+)/i,
        ],

        views: [
            /"view_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
            /"viewCount"\s*:\s*(\d+)/i,
            /"play_count"\s*:\s*(\d+)/i,
            /"video_view_count"\s*:\s*(\d+)/i,
        ],

        creationTime: [
            /"creation_time"\s*:\s*(\d+)/i,
            /"publish_time"\s*:\s*(\d+)/i,
        ],
    };

    for (const [key, regexList] of Object.entries(patterns)) {
        for (const regex of regexList) {
            const match = html.match(regex);

            if (match?.[1]) {
                if (key === "creationTime") {
                    const timestamp = Number(match[1]);

                    if (
                        Number.isFinite(timestamp) &&
                        timestamp > 0
                    ) {
                        stats.creationTime =
                            new Date(
                                timestamp * 1000
                            ).toISOString();
                    }
                } else {
                    stats[key] = match[1];
                }

                break;
            }
        }
    }

    return stats;
}

function formatTestNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "ไม่พบข้อมูล";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return String(value);
    }

    return number.toLocaleString("en-US");
}

function renderTestPage({
    inputUrl = "",
    resolvedUrl = "",
    title = "",
    authorName = "",
    description = "",
    image = "",
    stats = {},
    error = "",
}) {
    const statRows = [
        [
            "ชื่อคนโพสต์",
            authorName || "ไม่พบข้อมูล",
        ],

        [
            "ชื่อโพสต์ / วิดีโอ",
            title || "ไม่พบข้อมูล",
        ],

        [
            "ถูกใจ / ปฏิกิริยา",
            formatTestNumber(stats.reactions),
        ],

        [
            "ความคิดเห็น",
            formatTestNumber(stats.comments),
        ],

        [
            "แชร์",
            formatTestNumber(stats.shares),
        ],

        [
            "ยอดดู",
            formatTestNumber(stats.views),
        ],

        [
            "เวลาสร้างโพสต์",
            stats.creationTime ||
            "ไม่พบข้อมูล",
        ],

        [
            "URL ที่ส่ง",
            inputUrl || "—",
        ],

        [
            "URL ที่ Resolve ได้",
            resolvedUrl ||
            "ไม่พบข้อมูล",
        ],
    ];

    return `<!DOCTYPE html>
<html lang="th">
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>C2Z Facebed Test</title>

<style>

:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  background: #111318;
  color: #f3f4f6;
}

.wrap {
  width:
    min(1000px, calc(100% - 32px));

  margin: 40px auto;
}

.card {
  background: #1b1e24;
  border: 1px solid #30343d;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 18px;

  box-shadow:
    0 8px 30px rgba(0,0,0,.25);
}

h1 {
  margin: 0 0 8px;
  font-size: 26px;
}

.muted {
  color: #9ca3af;
}

form {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

input {
  flex: 1;
  min-width: 0;

  background: #0f1115;
  border: 1px solid #3a3f49;
  border-radius: 10px;

  color: #fff;

  padding: 12px 14px;
  font-size: 14px;

  outline: none;
}

input:focus {
  border-color: #5865f2;
}

button {
  border: 0;
  border-radius: 10px;

  padding: 12px 18px;

  background: #5865f2;
  color: white;

  font-weight: 700;

  cursor: pointer;
}

.preview {
  display: grid;

  grid-template-columns:
    240px 1fr;

  gap: 20px;

  align-items: start;
}

.preview img {
  width: 100%;

  aspect-ratio: 16 / 9;

  object-fit: cover;

  border-radius: 12px;

  background: #0f1115;
}

.stats {
  width: 100%;
  border-collapse: collapse;
}

.stats td {
  padding: 11px 8px;

  border-bottom:
    1px solid #30343d;

  vertical-align: top;

  word-break: break-word;
}

.stats td:first-child {
  width: 190px;
  color: #9ca3af;
}

.error {
  background: #3a171b;

  border:
    1px solid #7f1d1d;

  color: #fecaca;

  border-radius: 10px;

  padding: 14px;

  margin-top: 18px;
}

@media (max-width: 700px) {

  form,
  .preview {
    display: block;
  }

  button {
    width: 100%;
    margin-top: 10px;
  }

  .preview img {
    margin-bottom: 16px;
  }

  .stats td:first-child {
    width: 130px;
  }
}

</style>

</head>

<body>

<div class="wrap">

<div class="card">

<h1>🧪 C2Z Facebed Test</h1>

<div class="muted">
ทดสอบการดึงข้อมูลจาก Facebook
โดยไม่กระทบหน้า Facebed อื่น
</div>

<form method="GET">

<input
  type="text"
  name="test"
  value="${escapeHtml(inputUrl)}"
  placeholder="https://www.facebook.com/reel/..."
  autocomplete="off"
>

<button type="submit">
Test
</button>

</form>

${error
            ? `
<div class="error">
${escapeHtml(error)}
</div>
`
            : ""
        }

</div>

${inputUrl && !error
            ? `

<div class="card">

<div class="preview">

${image
                ? `
<img
  src="${escapeHtml(image)}"
  alt=""
>
`
                : `
<div class="muted">
ไม่มีรูป Preview
</div>
`
            }

<div>

<h2 style="margin-top:0">

${escapeHtml(
                title ||
                authorName ||
                "Facebook Video"
            )}

</h2>

${authorName
                ? `
<div class="muted">

โพสต์โดย:

<strong>
${escapeHtml(authorName)}
</strong>

</div>
`
                : ""
            }

${description
                ? `
<p>
${escapeHtml(description)}
</p>
`
                : ""
            }

</div>

</div>

</div>

<div class="card">

<h2>
รายละเอียด
</h2>

<table class="stats">

<tbody>

${statRows
                .map(
                    ([label, value]) => `
<tr>

<td>
${escapeHtml(label)}
</td>

<td>
${escapeHtml(value)}
</td>

</tr>
`
                )
                .join("")}

</tbody>

</table>

</div>

`
            : ""
        }

</div>

</body>
</html>`;
}

// ============================================================
// GET FACEBOOK VIDEO OWNER
// ============================================================

function extractFacebookOwnerName(html) {
    if (!html) return "";

    const patterns = [
        /"short_form_video_context"\s*:\s*\{[\s\S]{0,8000}?"video_owner"\s*:\s*\{[\s\S]{0,3000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i,

        /"video_owner"\s*:\s*\{[\s\S]{0,3000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i,

        /"videoOwner"\s*:\s*\{[\s\S]{0,3000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i,

        /"owner"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i,

        /"actor"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/i,
    ];

    for (const regex of patterns) {
        const match = html.match(regex);

        if (match?.[1]) {
            const name = decodeEscapedUrl(
                match[1]
            ).trim();

            if (
                name &&
                name.length < 200 &&
                name !== "Facebook Video"
            ) {
                return name;
            }
        }
    }

    return "";
}

// ============================================================
// SUPPORTED FACEBED ROUTES
// ============================================================

function isSupportedFacebookPath(
    pathname,
    search = ""
) {
    const path =
        pathname.replace(/\/+$/, "");

    const params =
        new URLSearchParams(search);

    if (
        /^\/share\/(r|p|v|[^/]+)(\/[^/]+)?$/i.test(
            path
        )
    ) {
        return true;
    }

    if (
        /^\/[^/]+\/posts\/[^/]+$/i.test(
            path
        )
    ) {
        return true;
    }

    if (
        /^\/[^/]+\/videos\/\d+$/i.test(
            path
        )
    ) {
        return true;
    }

    if (
        /^\/groups\/[^/]+\/posts\/[^/]+$/i.test(
            path
        )
    ) {
        return true;
    }

    if (
        /^\/groups\/[^/]+\/permalink\/[^/]+$/i.test(
            path
        )
    ) {
        return true;
    }

    if (
        /^\/reels?\/\d+$/i.test(path)
    ) {
        return true;
    }

    if (
        /^\/watch$/i.test(path) &&
        params.has("v")
    ) {
        return true;
    }

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

function extractFacebookUrlFromPath(
    requestUrl
) {
    let path =
        requestUrl.pathname;

    if (path.startsWith("/")) {
        path = path.substring(1);
    }

    try {
        path =
            decodeURIComponent(path);
    } catch { }

    if (!/^https?:\/\//i.test(path)) {
        return "";
    }

    let facebookUrl = path;

    if (requestUrl.search) {
        facebookUrl +=
            requestUrl.search;
    }

    if (!isFacebookUrl(facebookUrl)) {
        return "";
    }

    return facebookUrl;
}

// ============================================================
// INSPECT FACEBOOK PAGE
// ============================================================

function inspectFacebookPage(
    html,
    baseUrl
) {
    const canonical =
        makeAbsoluteUrl(
            getCanonical(html),
            baseUrl
        );

    const ogUrl =
        makeAbsoluteUrl(
            getMeta(html, "og:url"),
            baseUrl
        );

    const title =
        getMeta(html, "og:title") ||
        getMeta(html, "twitter:title") ||
        "";

    const authorName =
        extractFacebookOwnerName(html);

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
        authorName,
        description,
        image,
    };
}

// ============================================================
// RESOLVE FACEBOOK URL
// ============================================================

async function resolveFacebookShare(
    sourceUrl
) {
    try {
        const headResponse =
            await fetch(sourceUrl, {
                method: "HEAD",
                redirect: "follow",
                headers: FACEBOOK_HEADERS,
            });

        const headFinalUrl =
            headResponse.url || "";

        if (
            headFinalUrl &&
            !isSharePath(headFinalUrl) &&
            !isLoginPath(headFinalUrl) &&
            looksLikePostUrl(
                headFinalUrl
            )
        ) {
            return {
                success: true,
                resolvedUrl:
                    headFinalUrl,
                html: "",
                reason:
                    "HEAD redirect",
            };
        }
    } catch (error) { }

    const response =
        await fetch(sourceUrl, {
            method: "GET",
            redirect: "follow",
            headers: FACEBOOK_HEADERS,
        });

    const html =
        await response.text();

    const finalUrl =
        response.url ||
        sourceUrl;

    const pageInfo =
        inspectFacebookPage(
            html,
            finalUrl
        );

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
            resolvedUrl:
                declaredUrl,
            html,
            finalUrl,
            title:
                pageInfo.title,
            authorName:
                pageInfo.authorName,
            description:
                pageInfo.description,
            image:
                pageInfo.image,
            reason:
                "canonical/og:url resolved",
        };
    }

    if (
        finalUrl &&
        !isSharePath(finalUrl) &&
        !isLoginPath(finalUrl) &&
        looksLikePostUrl(finalUrl)
    ) {
        return {
            success: true,
            resolvedUrl:
                finalUrl,
            html,
            finalUrl,
            title:
                pageInfo.title,
            authorName:
                pageInfo.authorName,
            description:
                pageInfo.description,
            image:
                pageInfo.image,
            reason:
                "final URL resolved",
        };
    }

    return {
        success: false,
        resolvedUrl: "",
        html,
        finalUrl,
        title:
            pageInfo.title,
        authorName:
            pageInfo.authorName,
        description:
            pageInfo.description,
        image:
            pageInfo.image,
        reason:
            isLoginPath(finalUrl)
                ? "Facebook login page"
                : "Could not resolve Facebook URL",
    };
}

// ============================================================
// EXTRACT VIDEO URL
// ============================================================

function extractFacebookVideoUrl(
    html,
    requestedId = ""
) {
    if (!html) return "";

    const candidates = [];

    const jsonScriptRegex =
        /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

    let match;

    while (
        (match =
            jsonScriptRegex.exec(html)) !== null
    ) {
        const raw = match[1];

        if (!raw) continue;

        try {
            const json =
                JSON.parse(raw);

            walkVideoNodes(
                json,
                requestedId,
                candidates
            );
        } catch { }
    }

    extractRawVideoUrls(
        html,
        requestedId,
        candidates
    );

    candidates.sort(
        (a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            if (a.isHd !== b.isHd) {
                return a.isHd ? -1 : 1;
            }

            return 0;
        }
    );

    for (const candidate of candidates) {
        if (!candidate.url) continue;

        const decoded =
            decodeEscapedUrl(
                candidate.url
            );

        if (
            /^https?:\/\//i.test(decoded) &&
            /\.(mp4|m4v)(?:[?#]|$)/i.test(
                decoded
            )
        ) {
            return decoded;
        }

        if (
            /^https?:\/\//i.test(decoded) &&
            /(?:video|fbcdn|scontent)/i.test(
                decoded
            )
        ) {
            return decoded;
        }
    }

    return "";
}

function walkVideoNodes(
    node,
    requestedId,
    candidates,
    depth = 0
) {
    if (
        !node ||
        depth > 30 ||
        typeof node === "string"
    ) {
        return;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            walkVideoNodes(
                item,
                requestedId,
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

    const legacy =
        node.videoDeliveryLegacyFields;

    if (
        legacy &&
        typeof legacy === "object"
    ) {
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

    for (const [
        key,
        value,
    ] of Object.entries(node)) {
        if (
            key ===
            "browser_native_hd_url" ||
            key ===
            "browser_native_sd_url" ||
            key ===
            "browserNativeHdUrl" ||
            key ===
            "browserNativeSdUrl" ||
            key ===
            "videoDeliveryLegacyFields"
        ) {
            continue;
        }

        walkVideoNodes(
            value,
            requestedId,
            candidates,
            depth + 1
        );
    }
}

function addVideoCandidate(
    url,
    node,
    requestedId,
    candidates,
    isHd
) {
    if (
        !url ||
        typeof url !== "string"
    ) {
        return;
    }

    let score = 0;
    let serialized = "";

    try {
        serialized =
            JSON.stringify(node);
    } catch {
        serialized = "";
    }

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
        const regex =
            new RegExp(
                `"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
                "gi"
            );

        let match;

        while (
            (match =
                regex.exec(html)) !== null
        ) {
            const surroundingStart =
                Math.max(
                    0,
                    match.index - 5000
                );

            const surroundingEnd =
                Math.min(
                    html.length,
                    match.index +
                    match[0].length +
                    5000
                );

            const surrounding =
                html.slice(
                    surroundingStart,
                    surroundingEnd
                );

            let score = 0;

            if (
                requestedId &&
                surrounding.includes(
                    requestedId
                )
            ) {
                score += 100;
            }

            if (
                key ===
                "browser_native_hd_url"
            ) {
                score += 20;
            }

            candidates.push({
                url: match[1],
                score,
                isHd:
                    key ===
                    "browser_native_hd_url",
            });
        }
    }
}

function extractVideoId(url) {
    if (!url) return "";

    const patterns = [
        /\/videos\/(\d+)/i,
        /\/video\/(\d+)/i,
        /\/reel\/(\d+)/i,
        /\/reels\/(\d+)/i,
    ];

    for (const regex of patterns) {
        const match =
            url.match(regex);

        if (match?.[1]) {
            return match[1];
        }
    }

    return "";
}

// ============================================================
// HTML PAGE FOR DISCORD EMBED
// ============================================================

function htmlPage(data) {
    const {
        sourceUrl,
        videoUrl,
        title,
        authorName,
        description,
        image,
    } = data;

    const safeTitle =
        title &&
            title !== "Facebook Video"
            ? title
            : (
                authorName ||
                "Facebook Video"
            );

    const safeDescription =
        description ||
        "Facebook video converted by Facebed";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>${escapeHtml(
        safeTitle
    )}</title>

<meta name="viewport" content="width=device-width, initial-scale=1">

<meta
  name="description"
  content="${escapeHtml(
        safeDescription
    )}"
>

<!-- Open Graph Meta Tags -->

<meta
  property="og:site_name"
  content="C2Z Facebed"
>

<meta
  property="og:title"
  content="${escapeHtml(
        safeTitle
    )}"
>

<meta
  property="og:description"
  content="${escapeHtml(
        safeDescription
    )}"
>

<meta
  property="og:type"
  content="video.other"
>

<meta
  property="og:url"
  content="${escapeHtml(
        sourceUrl
    )}"
>

${image
            ? `<meta property="og:image" content="${escapeHtml(
                image
            )}">`
            : ""
        }

${videoUrl
            ? `
<meta property="og:video" content="${escapeHtml(
                videoUrl
            )}">

<meta property="og:video:url" content="${escapeHtml(
                videoUrl
            )}">

<meta property="og:video:secure_url" content="${escapeHtml(
                videoUrl
            )}">

<meta property="og:video:type" content="video/mp4">

<meta property="og:video:width" content="1280">

<meta property="og:video:height" content="720">

<meta name="twitter:card" content="player">

<meta name="twitter:title" content="${escapeHtml(
                safeTitle
            )}">

<meta name="twitter:description" content="${escapeHtml(
                safeDescription
            )}">

<meta name="twitter:image" content="${escapeHtml(
                image || ""
            )}">

<meta name="twitter:player:stream" content="${escapeHtml(
                videoUrl
            )}">

<meta name="twitter:player:stream:content_type" content="video/mp4">
`
            : ""
        }

</head>

<body>

<h1>${escapeHtml(
            safeTitle
        )}</h1>

<p>${escapeHtml(
            safeDescription
        )}</p>

</body>
</html>`;
}

// ============================================================
// ERROR RESPONSE
// ============================================================

function errorResponse(
    message,
    status = 400
) {
    return new Response(
        JSON.stringify({
            success: false,
            error: message,
        }),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=UTF-8",
                "Cache-Control":
                    "no-store",
            },
        }
    );
}

// ============================================================
// WORKER MAIN FETCH
// ============================================================

export default {
    async fetch(request) {
        const requestUrl =
            new URL(request.url);

        // ========================================================
        // TEST PAGE
        //
        // https://fb.c2z.top/?test=https://www.facebook.com/reel/...
        //
        // ใช้สำหรับดูข้อมูลที่ดึงจาก Facebook
        // ไม่เปลี่ยนพฤติกรรมของ route อื่น
        // ========================================================

        if (requestUrl.searchParams.has("test")) {
            const testValue =
                requestUrl.searchParams
                    .get("test")
                    ?.trim() || "";

            // เปิด ?test เปล่า ๆ
            if (!testValue) {
                return new Response(
                    renderTestPage({}),
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
            }

            if (!isFacebookUrl(testValue)) {
                return new Response(
                    renderTestPage({
                        inputUrl: testValue,

                        error:
                            "URL นี้ไม่ใช่ Facebook URL ที่รองรับ",
                    }),
                    {
                        status: 400,

                        headers: {
                            "Content-Type":
                                "text/html; charset=UTF-8",

                            "Cache-Control":
                                "no-store, max-age=0",
                        },
                    }
                );
            }

            try {
                const resolved =
                    await resolveFacebookShare(
                        testValue
                    );

                let html =
                    resolved.html || "";

                let finalUrl =
                    resolved.resolvedUrl ||
                    resolved.finalUrl ||
                    testValue;

                // HEAD อาจ resolve ได้ก่อน
                // แต่ไม่มี HTML
                //
                // ดังนั้นหน้า Test จะ GET
                // URL ที่ resolve ได้อีกครั้ง

                if (!html && finalUrl) {
                    const detailResponse =
                        await fetch(
                            finalUrl,
                            {
                                method: "GET",

                                redirect: "follow",

                                headers:
                                    FACEBOOK_HEADERS,
                            }
                        );

                    html =
                        await detailResponse.text();

                    finalUrl =
                        detailResponse.url ||
                        finalUrl;
                }

                const pageInfo =
                    inspectFacebookPage(
                        html,
                        finalUrl
                    );

                const stats =
                    extractFacebookStats(
                        html
                    );

                const authorName =
                    pageInfo.authorName ||
                    resolved.authorName ||
                    "";

                return new Response(
                    renderTestPage({
                        inputUrl:
                            testValue,

                        resolvedUrl:
                            pageInfo.canonical ||
                            pageInfo.ogUrl ||
                            resolved.resolvedUrl ||
                            finalUrl,

                        title:
                            pageInfo.title ||
                            resolved.title ||
                            "",

                        authorName,

                        description:
                            pageInfo.description ||
                            resolved.description ||
                            "",

                        image:
                            pageInfo.image ||
                            resolved.image ||
                            "",

                        stats,
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

                return new Response(
                    renderTestPage({
                        inputUrl:
                            testValue,

                        error:
                            error?.message ||
                            "เกิดข้อผิดพลาดระหว่างดึงข้อมูล Facebook",
                    }),
                    {
                        status: 500,

                        headers: {
                            "Content-Type":
                                "text/html; charset=UTF-8",

                            "Cache-Control":
                                "no-store, max-age=0",
                        },
                    }
                );
            }
        }

        // เช็กว่าเป็น Discordbot
        // หรือ Social Crawlers หรือไม่

        const ua =
            (
                request.headers.get(
                    "user-agent"
                ) || ""
            ).toLowerCase();

        const isDiscordOrBot =
            ua.includes("discordbot") ||
            ua.includes("telegrambot") ||
            ua.includes("twitterbot") ||
            ua.includes(
                "facebookexternalhit"
            );

        // ========================================================
        // 1. HOME
        // ========================================================

        if (
            requestUrl.pathname === "/" &&
            !requestUrl.searchParams.has(
                "url"
            )
        ) {
            return new Response(
                "C2Z Facebed Ready",
                {
                    status: 200,
                }
            );
        }

        // ========================================================
        // 2. EMBEDDED URL
        //
        // /https://www.facebook.com/...
        // ========================================================

        const embeddedFacebookUrl =
            extractFacebookUrlFromPath(
                requestUrl
            );

        if (embeddedFacebookUrl) {
            // คนเปิดจาก Browser
            // เด้งกลับ Facebook

            if (!isDiscordOrBot) {
                return Response.redirect(
                    embeddedFacebookUrl,
                    302
                );
            }

            try {
                const resolved =
                    await resolveFacebookShare(
                        embeddedFacebookUrl
                    );

                let videoUrl =
                    extractFacebookVideoUrl(
                        resolved.html,
                        extractVideoId(
                            resolved.resolvedUrl
                        )
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
                            videoHtml,
                            extractVideoId(
                                resolved.resolvedUrl
                            )
                        );
                }

                let discordVideoUrl =
                    "";

                if (videoUrl) {
                    discordVideoUrl =
                        new URL(
                            "/video",
                            requestUrl.origin
                        ).href +
                        "?url=" +
                        encodeURIComponent(
                            embeddedFacebookUrl
                        );
                }

                return new Response(
                    htmlPage({
                        sourceUrl:
                            embeddedFacebookUrl,

                        resolvedUrl:
                            resolved.resolvedUrl,

                        videoUrl:
                            discordVideoUrl,

                        title:
                            resolved.title,

                        authorName:
                            resolved.authorName,

                        description:
                            resolved.description,

                        image:
                            resolved.image,
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
                return errorResponse(
                    "Embedded URL resolver error",
                    500
                );
            }
        }

        // ========================================================
        // 3. SUPPORTED FACEBOOK ROUTES
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

            // คนเปิดจาก Browser
            // เด้งกลับ Facebook

            if (!isDiscordOrBot) {
                return Response.redirect(
                    facebookUrl,
                    302
                );
            }

            try {
                const resolved =
                    await resolveFacebookShare(
                        facebookUrl
                    );

                let videoUrl =
                    extractFacebookVideoUrl(
                        resolved.html,
                        extractVideoId(
                            resolved.resolvedUrl
                        )
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
                            videoHtml,
                            extractVideoId(
                                resolved.resolvedUrl
                            )
                        );
                }

                let discordVideoUrl =
                    "";

                if (videoUrl) {
                    discordVideoUrl =
                        new URL(
                            "/video",
                            requestUrl.origin
                        ).href +
                        "?url=" +
                        encodeURIComponent(
                            facebookUrl
                        );
                }

                return new Response(
                    htmlPage({
                        sourceUrl:
                            facebookUrl,

                        resolvedUrl:
                            resolved.resolvedUrl,

                        videoUrl:
                            discordVideoUrl,

                        title:
                            resolved.title,

                        authorName:
                            resolved.authorName,

                        description:
                            resolved.description,

                        image:
                            resolved.image,
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
                return errorResponse(
                    "Facebed route error",
                    500
                );
            }
        }

        // ========================================================
        // 4. /video
        //
        // Discord MP4 DIRECT STREAM
        // ========================================================

        const sourceUrl =
            requestUrl.searchParams.get(
                "url"
            );

        if (
            requestUrl.pathname ===
            "/video" &&
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
                        resolved.html,
                        extractVideoId(
                            resolved.resolvedUrl
                        )
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

                return new Response(
                    null,
                    {
                        status: 302,

                        headers: {
                            Location:
                                videoUrl,

                            "Cache-Control":
                                "no-store, max-age=0",
                        },
                    }
                );
            } catch (error) {
                return errorResponse(
                    "Internal resolver error",
                    500
                );
            }
        }

        // ========================================================
        // 404
        // ========================================================

        return errorResponse(
            "Route not found",
            404
        );
    },
};