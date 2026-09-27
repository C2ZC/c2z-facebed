const FACEBOOK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const CREDIT = "faced by C2Z";
const BASE = "https://fb.c2z.top";

/* =========================================================
   BASIC HELPERS
========================================================= */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;|&#47;/gi, "/");
}

function cleanText(value) {
  return decodeEntities(String(value ?? ""))
    .replace(/\\u0025/gi, "%")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0022/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value) {
  if (!value) return "";

  let v = cleanText(value);

  if (v.startsWith("//")) {
    return "https:" + v;
  }

  return v;
}

function isFacebookUrl(value) {
  try {
    const u = new URL(value);

    return (
      /(^|\.)facebook\.com$/i.test(u.hostname) ||
      /(^|\.)fb\.watch$/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}

/* =========================================================
   FACEBOOK URL FROM PATH

   Supports:

   /https://www.facebook.com/share/r/xxxxx/

   /https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2Fxxxxx%2F
========================================================= */

function facebookUrlFromPath(pathname) {
  if (!pathname || pathname === "/") {
    return null;
  }

  let raw = pathname.startsWith("/")
    ? pathname.slice(1)
    : pathname;

  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(raw);

      if (decoded === raw) {
        break;
      }

      raw = decoded;
    } catch {
      break;
    }
  }

  raw = raw.trim();

  if (
    /^https?:\/\/(?:www\.)?facebook\.com\//i.test(raw) ||
    /^https?:\/\/(?:www\.)?fb\.watch\//i.test(raw)
  ) {
    return raw;
  }

  return null;
}

/* =========================================================
   HTML META
========================================================= */

function htmlMeta(html, property) {
  const p = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${p}["']`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+name=["']${p}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${p}["']`,
      "i"
    ),
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return "";
}

function canonicalFromHtml(html) {
  const a = html.match(
    /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i
  );

  if (a?.[1]) {
    return absoluteUrl(a[1]);
  }

  const b = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i
  );

  if (b?.[1]) {
    return absoluteUrl(b[1]);
  }

  return "";
}

/* =========================================================
   JSON SCRIPT PARSER
========================================================= */

function parseJsonScripts(html) {
  const result = [];

  const regex =
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const content = match[1]?.trim();

    if (!content) {
      continue;
    }

    try {
      result.push(JSON.parse(content));
    } catch {
      // Ignore malformed JSON blocks.
    }
  }

  return result;
}

function walk(node, callback, depth = 0) {
  if (node == null || depth > 18) {
    return;
  }

  callback(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, callback, depth + 1);
    }

    return;
  }

  if (typeof node === "object") {
    for (const value of Object.values(node)) {
      walk(value, callback, depth + 1);
    }
  }
}

/* =========================================================
   TARGET IDS
========================================================= */

function idFromNode(node) {
  if (!node || typeof node !== "object") {
    return "";
  }

  const keys = [
    "video_id",
    "videoId",
    "reel_id",
    "reelId",
    "story_fbid",
    "storyId",
    "post_id",
    "postId",
    "legacy_fbid",
    "id",
  ];

  for (const key of keys) {
    const value = node[key];

    if (
      typeof value === "string" &&
      /^\d{8,}$/.test(value)
    ) {
      return value;
    }

    if (
      typeof value === "number" &&
      value > 10000000
    ) {
      return String(value);
    }
  }

  return "";
}

function targetIdsFromUrl(url) {
  const ids = new Set();

  try {
    const u = new URL(url);

    const add = (value) => {
      if (
        value &&
        /^\d{8,}$/.test(String(value))
      ) {
        ids.add(String(value));
      }
    };

    for (const key of [
      "v",
      "fbid",
      "story_fbid",
      "video_id",
    ]) {
      add(u.searchParams.get(key));
    }

    const parts = u.pathname
      .split("/")
      .filter(Boolean);

    for (const part of parts) {
      if (/^\d{8,}$/.test(part)) {
        add(part);
      }
    }
  } catch {}

  return [...ids];
}

/* =========================================================
   VIDEO EXTRACTION

   Keep the same architecture that was already working:
   Facebook -> extract MP4 -> /video -> 302 MP4
========================================================= */

function findVideoNode(jsonBlocks, targetIds) {
  let fallback = null;
  let matched = null;

  for (const root of jsonBlocks) {
    walk(root, (node) => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      const hd =
        node.browser_native_hd_url ||
        node.videoDeliveryLegacyFields?.browser_native_hd_url;

      const sd =
        node.browser_native_sd_url ||
        node.videoDeliveryLegacyFields?.browser_native_sd_url;

      if (!hd && !sd) {
        return;
      }

      if (!fallback) {
        fallback = node;
      }

      const id = idFromNode(node);

      if (
        id &&
        targetIds.includes(id)
      ) {
        matched = node;
      }
    });
  }

  return matched || fallback;
}

function videoUrlsFromHtml(
  html,
  jsonBlocks,
  targetIds
) {
  const urls = [];

  function add(value) {
    if (!value) {
      return;
    }

    let v = String(value);

    v = v
      .replace(/\\u0025/gi, "%")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u003A/gi, ":")
      .replace(/\\u003D/gi, "=")
      .replace(/\\u0026/gi, "&")
      .replace(/\\"/g, '"')
      .replace(/\\\//g, "/");

    v = absoluteUrl(v);

    if (
      /^https?:\/\//i.test(v) &&
      /\.(mp4|m4v)(?:[?#]|$)/i.test(v)
    ) {
      if (!urls.includes(v)) {
        urls.push(v);
      }
    }
  }

  const node = findVideoNode(
    jsonBlocks,
    targetIds
  );

  if (node) {
    add(node.browser_native_hd_url);
    add(node.browser_native_sd_url);

    if (node.videoDeliveryLegacyFields) {
      add(
        node.videoDeliveryLegacyFields
          .browser_native_hd_url
      );

      add(
        node.videoDeliveryLegacyFields
          .browser_native_sd_url
      );
    }
  }

  /*
   * Direct JSON fallback
   */

  for (const key of [
    "browser_native_hd_url",
    "browser_native_sd_url",
    "playable_url_quality_hd",
    "playable_url_quality_sd",
    "playable_url",
  ]) {
    const regex = new RegExp(
      `"${key}"\\s*:\\s*"([^"]+)"`,
      "gi"
    );

    let match;

    while ((match = regex.exec(html))) {
      add(match[1]);
    }
  }

  /*
   * Last fallback:
   * Facebook CDN MP4 URLs
   */

  const mp4Regex =
    /https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:mp4|m4v)(?:\?[^"'<>\\\s]*)?/gi;

  let match;

  while ((match = mp4Regex.exec(html))) {
    add(match[0]);
  }

  return urls;
}

/* =========================================================
   AUTHOR
========================================================= */

function extractAuthorFromJson(jsonBlocks) {
  const candidates = [];

  function addObject(obj, bonus = 0) {
    if (!obj || typeof obj !== "object") {
      return;
    }

    const name =
      obj.name ||
      obj.full_name ||
      obj.display_name ||
      obj.title;

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return;
    }

    const type = String(
      obj.__typename ||
      obj.__type__ ||
      obj.type ||
      ""
    ).toLowerCase();

    let score = bonus;

    if (type.includes("user")) {
      score += 10;
    }

    if (type.includes("page")) {
      score += 9;
    }

    if (type.includes("profile")) {
      score += 8;
    }

    if (type.includes("actor")) {
      score += 7;
    }

    if (type.includes("owner")) {
      score += 7;
    }

    candidates.push({
      name: cleanText(name),
      score,
    });
  }

  for (const root of jsonBlocks) {
    walk(root, (node) => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      /*
       * Highest priority:
       * short_form_video_context.video_owner
       */

      if (
        node.short_form_video_context &&
        typeof node.short_form_video_context ===
          "object"
      ) {
        addObject(
          node.short_form_video_context
            .video_owner,
          100
        );
      }

      /*
       * Normal owner fields
       */

      for (const key of [
        "video_owner",
        "videoOwner",
        "owner",
        "author",
        "actor",
        "profile",
        "page",
        "user",
      ]) {
        if (
          node[key] &&
          typeof node[key] === "object"
        ) {
          addObject(node[key]);
        }
      }
    });
  }

  candidates.sort(
    (a, b) => b.score - a.score
  );

  return candidates[0]?.name || "";
}

function extractAuthorFromRawHtml(html) {
  const patterns = [
    /"short_form_video_context"\s*:\s*\{[\s\S]{0,5000}?"video_owner"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"([^"]+)"/i,

    /"video_owner"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"([^"]+)"/i,

    /"videoOwner"\s*:\s*\{[\s\S]{0,2000}?"name"\s*:\s*"([^"]+)"/i,

    /"owner"\s*:\s*\{[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/i,

    /"author"\s*:\s*\{[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/i,

    /"actor"\s*:\s*\{[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/i,
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (match?.[1]) {
      const name = cleanText(
        match[1]
          .replace(/\\"/g, '"')
          .replace(/\\\//g, "/")
      );

      if (
        name &&
        name.length < 200
      ) {
        return name;
      }
    }
  }

  return "";
}

/* =========================================================
   POST TEXT
========================================================= */

function extractPostText(
  jsonBlocks,
  html
) {
  const candidates = [];

  function add(value) {
    if (
      typeof value !== "string"
    ) {
      return;
    }

    const text = cleanText(value);

    if (!text) {
      return;
    }

    if (
      text.length < 2 ||
      text.length > 5000
    ) {
      return;
    }

    if (
      /^(Facebook Video|Video|Reels?)$/i.test(
        text
      )
    ) {
      return;
    }

    candidates.push(text);
  }

  for (const root of jsonBlocks) {
    walk(root, (node) => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      for (const key of [
        "message",
        "text",
        "body",
        "description",
      ]) {
        const value = node[key];

        if (
          typeof value === "string"
        ) {
          add(value);
        } else if (
          value &&
          typeof value === "object"
        ) {
          add(value.text);
        }
      }
    });
  }

  const description =
    htmlMeta(
      html,
      "og:description"
    );

  if (description) {
    add(description);
  }

  /*
   * Prefer actual post text over
   * generic "X views / reactions" metadata.
   */

  candidates.sort((a, b) => {
    const generic = /views|reactions|comments|shares/i;

    return (
      Number(generic.test(a)) -
      Number(generic.test(b))
    );
  });

  return candidates[0] || "";
}

/* =========================================================
   REACTIONS / COMMENTS / SHARES
========================================================= */

function numberValue(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const number = Number(
      value.replace(/,/g, "").trim()
    );

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function extractStats(jsonBlocks) {
  let likes = null;
  let comments = null;
  let shares = null;

  function take(obj, keys) {
    if (
      !obj ||
      typeof obj !== "object"
    ) {
      return null;
    }

    for (const key of keys) {
      const value = numberValue(
        obj[key]
      );

      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  for (const root of jsonBlocks) {
    walk(root, (node) => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      likes ??= take(node, [
        "reaction_count",
        "reactionCount",
        "total_reaction_count",
        "like_count",
        "likes_count",
      ]);

      comments ??= take(node, [
        "comment_count",
        "commentCount",
        "total_comment_count",
      ]);

      shares ??= take(node, [
        "share_count",
        "shareCount",
        "total_share_count",
      ]);

      if (
        node.feedback &&
        typeof node.feedback === "object"
      ) {
        likes ??= take(
          node.feedback,
          [
            "reaction_count",
            "reactionCount",
            "total_reaction_count",
          ]
        );

        comments ??= take(
          node.feedback,
          [
            "comment_count",
            "commentCount",
            "total_comment_count",
          ]
        );

        shares ??= take(
          node.feedback,
          [
            "share_count",
            "shareCount",
            "total_share_count",
          ]
        );
      }
    });
  }

  return {
    likes,
    comments,
    shares,
  };
}

function formatNumber(value) {
  if (value == null) {
    return "";
  }

  if (value >= 1000000) {
    return (
      (value / 1000000).toFixed(
        value >= 10000000 ? 0 : 1
      ) + "M"
    );
  }

  if (value >= 1000) {
    return (
      (value / 1000).toFixed(
        value >= 10000 ? 0 : 1
      ) + "K"
    );
  }

  return String(value);
}

function formatStats(stats) {
  const result = [];

  if (stats.likes != null) {
    result.push(
      `❤️ ${formatNumber(stats.likes)}`
    );
  }

  if (stats.comments != null) {
    result.push(
      `💬 ${formatNumber(stats.comments)}`
    );
  }

  if (stats.shares != null) {
    result.push(
      `↗️ ${formatNumber(stats.shares)}`
    );
  }

  return result.join("  ");
}

/* =========================================================
   DATE
========================================================= */

function extractDate(jsonBlocks) {
  let timestamp = null;

  for (const root of jsonBlocks) {
    walk(root, (node) => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node) ||
        timestamp != null
      ) {
        return;
      }

      for (const key of [
        "creation_time",
        "creationTime",
        "created_time",
        "createdTime",
        "publish_time",
        "published_time",
      ]) {
        const value = node[key];

        if (
          typeof value === "number" &&
          value > 1000000000
        ) {
          timestamp = value;
          return;
        }

        if (
          typeof value === "string" &&
          /^\d{10,13}$/.test(value)
        ) {
          timestamp = Number(value);
          return;
        }
      }
    });
  }

  if (timestamp == null) {
    return "";
  }

  if (timestamp < 100000000000) {
    timestamp *= 1000;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "th-TH",
    {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

/* =========================================================
   FACEBOOK FETCH / RESOLVE
========================================================= */

async function fetchFacebook(url) {
  const headers = {
    "User-Agent": FACEBOOK_UA,

    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
      "en-US,en;q=0.9,th;q=0.8",

    "Cache-Control":
      "no-cache",

    Pragma:
      "no-cache",

    "Upgrade-Insecure-Requests":
      "1",
  };

  const response = await fetch(
    url,
    {
      method: "GET",
      headers,
      redirect: "follow",
      cf: {
        cacheTtl: 0,
      },
    }
  );

  const html =
    await response.text();

  return {
    response,
    html,
    finalUrl:
      response.url || url,
  };
}

async function resolveFacebookUrl(
  inputUrl
) {
  const first =
    await fetchFacebook(inputUrl);

  let finalUrl =
    first.finalUrl || inputUrl;

  let html = first.html;

  const canonical =
    canonicalFromHtml(html);

  const ogUrl =
    htmlMeta(html, "og:url");

  if (
    canonical &&
    isFacebookUrl(canonical)
  ) {
    finalUrl = canonical;
  } else if (
    ogUrl &&
    isFacebookUrl(ogUrl)
  ) {
    finalUrl = ogUrl;
  }

  /*
   * Facebook /share links often need
   * a second request to the resolved
   * canonical URL.
   */

  if (
    finalUrl === inputUrl &&
    (
      inputUrl.includes("/share/") ||
      inputUrl.includes("/sharer/")
    )
  ) {
    const secondUrl =
      canonical || ogUrl;

    if (
      secondUrl &&
      isFacebookUrl(secondUrl) &&
      secondUrl !== inputUrl
    ) {
      const second =
        await fetchFacebook(
          secondUrl
        );

      html =
        second.html || html;

      finalUrl =
        second.finalUrl ||
        secondUrl;
    }
  }

  return {
    inputUrl,
    finalUrl,
    html,
  };
}

/* =========================================================
   VIDEO ENDPOINT
========================================================= */

function videoEndpoint(
  facebookUrl
) {
  return (
    `${BASE}/video?url=` +
    encodeURIComponent(
      facebookUrl
    )
  );
}

/* =========================================================
   EMBED HTML
========================================================= */

function createHtml(data) {
  const {
    facebookUrl,
    resolvedUrl,
    author,
    text,
    image,
    stats,
    date,
  } = data;

  const safeAuthor =
    author || "Facebook Video";

  const description =
    text || "Facebook Video";

  const statText =
    formatStats(stats);

  const info = [
    statText,
    date,
  ]
    .filter(Boolean)
    .join("  •  ");

  const videoUrl =
    videoEndpoint(
      resolvedUrl || facebookUrl
    );

  return `<!doctype html>
<html lang="en">
<head>

<meta charset="utf-8">

<title>${esc(safeAuthor)}</title>

<meta property="og:type"
      content="video.other">

<meta property="og:title"
      content="${esc(safeAuthor)}">

<meta property="og:description"
      content="${esc(description)}">

<meta property="og:site_name"
      content="${esc(
        [CREDIT, info]
          .filter(Boolean)
          .join("  •  ")
      )}">

<meta property="og:url"
      content="${esc(
        `${BASE}/https://www.facebook.com/`
      )}">

${
  image
    ? `<meta property="og:image"
              content="${esc(image)}">`
    : ""
}

<meta property="og:video"
      content="${esc(videoUrl)}">

<meta property="og:video:secure_url"
      content="${esc(videoUrl)}">

<meta property="og:video:type"
      content="video/mp4">

<meta property="og:video:width"
      content="1280">

<meta property="og:video:height"
      content="720">

<meta name="twitter:card"
      content="player">

<meta name="twitter:title"
      content="${esc(safeAuthor)}">

<meta name="twitter:description"
      content="${esc(description)}">

${
  image
    ? `<meta name="twitter:image"
              content="${esc(image)}">`
    : ""
}

<style>

html,
body {
  margin: 0;
  padding: 0;
  background: #111;
  color: #eee;
  font-family:
    Arial,
    Helvetica,
    sans-serif;
}

main {
  max-width: 900px;
  margin: 40px auto;
  padding: 24px;
}

.credit {
  color: #aaa;
  font-size: 14px;
  margin-bottom: 8px;
}

h1 {
  font-size: 28px;
  margin: 0 0 12px;
}

.info {
  color: #aaa;
  font-size: 14px;
  margin-bottom: 18px;
}

.text {
  white-space: pre-wrap;
  line-height: 1.5;
  margin-bottom: 18px;
}

video {
  width: 100%;
  max-height: 80vh;
  background: #000;
  border-radius: 10px;
}

a {
  color: #4ea1ff;
}

</style>

</head>

<body>

<main>

<div class="credit">
${esc(CREDIT)}
</div>

<h1>
${esc(safeAuthor)}
</h1>

${
  info
    ? `<div class="info">
${esc(info)}
</div>`
    : ""
}

${
  text
    ? `<div class="text">
${esc(text)}
</div>`
    : ""
}

<video
  controls
  playsinline
  preload="metadata"
  ${
    image
      ? `poster="${esc(image)}"`
      : ""
  }
>

<source
  src="${esc(videoUrl)}"
  type="video/mp4"
>

</video>

<p>

<a
  href="${esc(
    resolvedUrl || facebookUrl
  )}"
  rel="noopener"
>

Open on Facebook

</a>

</p>

</main>

</body>
</html>`;
}

/* =========================================================
   ERROR HTML
========================================================= */

function createErrorHtml(
  facebookUrl,
  errorText
) {
  const videoUrl =
    videoEndpoint(
      facebookUrl
    );

  return `<!doctype html>

<html>

<head>

<meta charset="utf-8">

<title>Facebook Video</title>

<meta property="og:type"
      content="video.other">

<meta property="og:title"
      content="Facebook Video">

<meta property="og:description"
      content="Facebook Video">

<meta property="og:video"
      content="${esc(videoUrl)}">

<meta property="og:video:secure_url"
      content="${esc(videoUrl)}">

<meta property="og:video:type"
      content="video/mp4">

</head>

<body
style="
background:#111;
color:#eee;
font-family:Arial;
padding:40px;
">

<h1>
Facebook Video
</h1>

<p>
Error
</p>

${
  errorText
    ? `<pre>${esc(errorText)}</pre>`
    : ""
}

<p>

<a href="${esc(
  facebookUrl
)}">

Open on Facebook

</a>

</p>

</body>

</html>`;
}

/* =========================================================
   BUILD FACEBOOK PAGE
========================================================= */

async function buildFacebookPage(
  facebookUrl
) {
  try {
    const resolved =
      await resolveFacebookUrl(
        facebookUrl
      );

    const jsonBlocks =
      parseJsonScripts(
        resolved.html
      );

    const targetIds =
      targetIdsFromUrl(
        resolved.finalUrl
      );

    const image =
      htmlMeta(
        resolved.html,
        "og:image"
      );

    const author =
      extractAuthorFromJson(
        jsonBlocks
      ) ||
      extractAuthorFromRawHtml(
        resolved.html
      );

    const text =
      extractPostText(
        jsonBlocks,
        resolved.html
      );

    const stats =
      extractStats(
        jsonBlocks
      );

    const date =
      extractDate(
        jsonBlocks
      );

    /*
     * We intentionally do NOT need
     * the direct MP4 here.
     *
     * Discord gets:
     *
     * /video?url=...
     *
     * and /video does the actual
     * extraction + 302 redirect.
     */

    return new Response(
      createHtml({
        facebookUrl,
        resolvedUrl:
          resolved.finalUrl,
        author,
        text,
        image,
        stats,
        date,
      }),
      {
        status: 200,

        headers: {
          "content-type":
            "text/html; charset=UTF-8",

          "cache-control":
            "no-store",
        },
      }
    );

  } catch (error) {

    console.error(
      "buildFacebookPage:",
      error
    );

    return new Response(
      createErrorHtml(
        facebookUrl,
        error instanceof Error
          ? error.message
          : String(error)
      ),
      {
        status: 200,

        headers: {
          "content-type":
            "text/html; charset=UTF-8",

          "cache-control":
            "no-store",
        },
      }
    );
  }
}

/* =========================================================
   VIDEO REDIRECT

   IMPORTANT:
   This is the working part.

   Facebook MP4
        ↓
   /video?url=...
        ↓
   302
        ↓
   Facebook CDN MP4
========================================================= */

async function getVideoResponse(
  facebookUrl
) {
  try {
    const resolved =
      await resolveFacebookUrl(
        facebookUrl
      );

    const jsonBlocks =
      parseJsonScripts(
        resolved.html
      );

    const targetIds =
      targetIdsFromUrl(
        resolved.finalUrl
      );

    const videos =
      videoUrlsFromHtml(
        resolved.html,
        jsonBlocks,
        targetIds
      );

    const video =
      videos[0];

    if (!video) {
      return new Response(
        "Video URL not found",
        {
          status: 404,

          headers: {
            "content-type":
              "text/plain; charset=UTF-8",

            "cache-control":
              "no-store",
          },
        }
      );
    }

    return Response.redirect(
      video,
      302
    );

  } catch (error) {

    console.error(
      "video:",
      error
    );

    return new Response(
      "Unable to extract video",
      {
        status: 502,

        headers: {
          "content-type":
            "text/plain; charset=UTF-8",

          "cache-control":
            "no-store",
        },
      }
    );
  }
}

/* =========================================================
   FACBED-STYLE ROUTES
========================================================= */

function routeFacebookUrl(
  pathname,
  searchParams
) {

  /*
   * /share/r/hash
   * /share/v/hash
   */

  if (
    /^\/share\/(?:r|v)\/[^/]+/i.test(
      pathname
    )
  ) {
    return (
      `https://www.facebook.com${pathname}`
    );
  }

  /*
   * /share/hash
   */

  if (
    /^\/share\/[^/]+/i.test(
      pathname
    )
  ) {
    return (
      `https://www.facebook.com${pathname}`
    );
  }

  /*
   * /reel/id
   * /reels/id
   */

  if (
    /^\/reels?\/\d+/i.test(
      pathname
    )
  ) {
    return (
      `https://www.facebook.com${pathname}`
    );
  }

  /*
   * /watch?v=...
   */

  if (
    pathname === "/watch" &&
    searchParams.get("v")
  ) {
    return (
      "https://www.facebook.com/watch?v=" +
      encodeURIComponent(
        searchParams.get("v")
      )
    );
  }

  /*
   * /photo?fbid=...
   */

  if (
    pathname === "/photo" &&
    searchParams.get("fbid")
  ) {
    return (
      "https://www.facebook.com/photo?fbid=" +
      encodeURIComponent(
        searchParams.get("fbid")
      )
    );
  }

  /*
   * /photo.php
   */

  if (
    pathname === "/photo.php"
  ) {
    const query =
      searchParams.toString();

    return (
      `https://www.facebook.com/photo.php${
        query ? "?" + query : ""
      }`
    );
  }

  /*
   * /permalink.php
   * /story.php
   */

  if (
    /^\/(?:permalink|story)\.php$/i.test(
      pathname
    )
  ) {
    const query =
      searchParams.toString();

    return (
      `https://www.facebook.com${pathname}${
        query ? "?" + query : ""
      }`
    );
  }

  /*
   * /groups/...
   */

  if (
    /^\/groups\//i.test(
      pathname
    )
  ) {
    const query =
      searchParams.toString();

    return (
      `https://www.facebook.com${pathname}${
        query ? "?" + query : ""
      }`
    );
  }

  /*
   * /username/videos/id
   */

  if (
    /\/videos\/\d+/i.test(
      pathname
    )
  ) {
    return (
      `https://www.facebook.com${pathname}`
    );
  }

  /*
   * /username/posts/id
   */

  if (
    /\/posts\/[^/]+/i.test(
      pathname
    )
  ) {
    return (
      `https://www.facebook.com${pathname}`
    );
  }

  return null;
}

/* =========================================================
   MAIN WORKER
========================================================= */

export default {

  async fetch(request) {

    const requestUrl =
      new URL(request.url);

    /*
     * Only GET / HEAD
     */

    if (
      request.method !== "GET" &&
      request.method !== "HEAD"
    ) {
      return new Response(
        "Method Not Allowed",
        {
          status: 405,

          headers: {
            Allow:
              "GET, HEAD",
          },
        }
      );
    }

    /* =====================================================
       /video?url=FACEBOOK_URL

       KEEP THIS BEFORE ALL OTHER ROUTES.
    ===================================================== */

    if (
      requestUrl.pathname ===
      "/video"
    ) {

      const facebookUrl =
        requestUrl.searchParams.get(
          "url"
        ) ||
        requestUrl.searchParams.get(
          "u"
        );

      if (
        !facebookUrl ||
        !isFacebookUrl(
          facebookUrl
        )
      ) {
        return new Response(
          "Missing or invalid Facebook URL",
          {
            status: 400,

            headers: {
              "content-type":
                "text/plain; charset=UTF-8",
            },
          }
        );
      }

      return getVideoResponse(
        facebookUrl
      );
    }

    /* =====================================================
       FULL FACEBOOK URL IN PATH

       Example:

       /https://www.facebook.com/share/r/xxxxx/
    ===================================================== */

    const directFacebookUrl =
      facebookUrlFromPath(
        requestUrl.pathname
      );

    if (directFacebookUrl) {

      return buildFacebookPage(
        directFacebookUrl
      );
    }

    /* =====================================================
       ?url=https://www.facebook.com/...
    ===================================================== */

    const queryFacebookUrl =
      requestUrl.searchParams.get(
        "url"
      );

    if (
      queryFacebookUrl &&
      isFacebookUrl(
        queryFacebookUrl
      )
    ) {

      return buildFacebookPage(
        queryFacebookUrl
      );
    }

    /* =====================================================
       FACEBED STYLE ROUTES
    ===================================================== */

    const routedFacebookUrl =
      routeFacebookUrl(
        requestUrl.pathname,
        requestUrl.searchParams
      );

    if (routedFacebookUrl) {

      return buildFacebookPage(
        routedFacebookUrl
      );
    }

    /* =====================================================
       HOME
    ===================================================== */

    if (
      requestUrl.pathname === "/"
    ) {

      const html = `<!doctype html>

<html>

<head>

<meta charset="utf-8">

<title>
faced by C2Z
</title>

<style>

body {
  background: #111;
  color: #eee;
  font-family: Arial, Helvetica, sans-serif;
  max-width: 800px;
  margin: 60px auto;
  padding: 20px;
}

input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  background: #222;
  color: #fff;
  border: 1px solid #444;
  border-radius: 6px;
}

button {
  margin-top: 10px;
  padding: 10px 18px;
  cursor: pointer;
}

</style>

</head>

<body>

<h1>
faced by C2Z
</h1>

<p>
Facebook video embed proxy.
</p>

<form>

<input
  name="url"
  placeholder="https://www.facebook.com/reel/..."
>

<button>
Open
</button>

</form>

</body>

</html>`;

      return new Response(
        html,
        {
          status: 200,

          headers: {
            "content-type":
              "text/html; charset=UTF-8",

            "cache-control":
              "no-store",
          },
        }
      );
    }

    /* =====================================================
       NOT FOUND
    ===================================================== */

    return new Response(
      "Not Found",
      {
        status: 404,

        headers: {
          "content-type":
            "text/plain; charset=UTF-8",
        },
      }
    );
  },
};