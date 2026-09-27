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

    const host =
      url.hostname.toLowerCase();

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

    return /^\/share\//i.test(
      url.pathname
    );
  } catch {
    return false;
  }
}


function isLoginPath(value) {
  try {
    const url = new URL(value);

    return /\/login/i.test(
      url.pathname
    );
  } catch {
    return false;
  }
}


function makeAbsoluteUrl(
  value,
  baseUrl
) {
  if (!value) return "";

  try {
    return new URL(
      value,
      baseUrl
    ).href;
  } catch {
    return "";
  }
}


function getMeta(
  html,
  propertyOrName
) {
  const escaped =
    propertyOrName.replace(
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

  for (
    const regex of patterns
  ) {
    const match =
      html.match(regex);

    if (match?.[1]) {
      return decodeHtmlEntities(
        match[1]
      );
    }
  }

  return "";
}


function getCanonical(html) {
  const match =
    html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );

  if (match?.[1]) {
    return decodeHtmlEntities(
      match[1]
    );
  }

  const reversed =
    html.match(
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
    );

  if (reversed?.[1]) {
    return decodeHtmlEntities(
      reversed[1]
    );
  }

  return "";
}


function looksLikePostUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);

    if (
      !/facebook\.com$/i.test(
        url.hostname
      ) &&
      !/\.facebook\.com$/i.test(
        url.hostname
      )
    ) {
      return false;
    }

    return (
      /\/videos?\//i.test(
        url.pathname
      ) ||
      /\/reel\//i.test(
        url.pathname
      ) ||
      /\/reels\//i.test(
        url.pathname
      ) ||
      /\/posts?\//i.test(
        url.pathname
      ) ||
      /\/watch/i.test(
        url.pathname
      )
    );
  } catch {
    return false;
  }
}


// ============================================================
// SUPPORTED FACEBED ROUTES
// ============================================================

function isSupportedFacebookPath(
  pathname,
  search = ""
) {
  const path =
    pathname.replace(
      /\/+$/,
      ""
    );

  const params =
    new URLSearchParams(
      search
    );


  // /share/r/:hash
  if (
    /^\/share\/r\/[^/]+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /share/p/:hash
  if (
    /^\/share\/p\/[^/]+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /share/v/:hash
  if (
    /^\/share\/v\/[^/]+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /share/:hash
  if (
    /^\/share\/[^/]+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /:user/posts/:id
  // /:user/posts/:hash
  if (
    /^\/[^/]+\/posts\/[^/]+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /:user/videos/:id
  if (
    /^\/[^/]+\/videos\/\d+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /groups/:id/posts/:id
  // /groups/:id/posts/:hash
  if (
    /^\/groups\/[^/]+\/posts\/[^/]+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /groups/:id/permalink/:id
  // /groups/:id/permalink/:hash
  if (
    /^\/groups\/[^/]+\/permalink\/[^/]+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /reel/:id
  if (
    /^\/reel\/\d+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /reels/:id
  if (
    /^\/reels\/\d+$/i.test(
      path
    )
  ) {
    return true;
  }


  // /watch?v=123
  if (
    /^\/watch$/i.test(
      path
    ) &&
    params.has("v")
  ) {
    return true;
  }


  // /permalink.php?story_fbid=...
  if (
    /^\/permalink\.php$/i.test(
      path
    ) &&
    params.has(
      "story_fbid"
    )
  ) {
    return true;
  }


  // /story.php?story_fbid=...
  if (
    /^\/story\.php$/i.test(
      path
    ) &&
    params.has(
      "story_fbid"
    )
  ) {
    return true;
  }


  return false;
}


// ============================================================
// FULL FACEBOOK URL IN PATH
//
// Example:
//
// /https://www.facebook.com/share/r/xxxxx/
//
// ============================================================

function extractFacebookUrlFromPath(
  requestUrl
) {
  let path =
    requestUrl.pathname;


  if (
    path.startsWith("/")
  ) {
    path =
      path.substring(1);
  }


  try {
    path =
      decodeURIComponent(
        path
      );
  } catch {
    // Keep original
  }


  if (
    !/^https?:\/\//i.test(
      path
    )
  ) {
    return "";
  }


  let facebookUrl =
    path;


  if (
    requestUrl.search
  ) {
    facebookUrl +=
      requestUrl.search;
  }


  if (
    !isFacebookUrl(
      facebookUrl
    )
  ) {
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
  const canonicalRaw =
    getCanonical(
      html
    );

  const ogUrlRaw =
    getMeta(
      html,
      "og:url"
    );


  const canonical =
    makeAbsoluteUrl(
      canonicalRaw,
      baseUrl
    );


  const ogUrl =
    makeAbsoluteUrl(
      ogUrlRaw,
      baseUrl
    );


  const title =
    getMeta(
      html,
      "og:title"
    ) ||
    getMeta(
      html,
      "twitter:title"
    ) ||
    "";


  const description =
    getMeta(
      html,
      "og:description"
    ) ||
    getMeta(
      html,
      "description"
    ) ||
    "";


  const image =
    getMeta(
      html,
      "og:image"
    ) ||
    getMeta(
      html,
      "twitter:image"
    ) ||
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
// RESOLVE FACEBOOK URL
// ============================================================

async function resolveFacebookShare(
  sourceUrl
) {

  // ----------------------------------------------------------
  // HEAD redirect
  // ----------------------------------------------------------

  try {

    const headResponse =
      await fetch(
        sourceUrl,
        {
          method:
            "HEAD",

          redirect:
            "follow",

          headers:
            FACEBOOK_HEADERS,
        }
      );


    const headFinalUrl =
      headResponse.url ||
      "";


    if (
      headFinalUrl &&
      !isSharePath(
        headFinalUrl
      ) &&
      !isLoginPath(
        headFinalUrl
      ) &&
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

  } catch (
    error
  ) {

    console.log(
      "HEAD resolve failed:",
      error?.message ||
        error
    );
  }


  // ----------------------------------------------------------
  // GET
  // ----------------------------------------------------------

  const response =
    await fetch(
      sourceUrl,
      {
        method:
          "GET",

        redirect:
          "follow",

        headers:
          FACEBOOK_HEADERS,
      }
    );


  const html =
    await response.text();


  const finalUrl =
    response.url ||
    sourceUrl;


  // ----------------------------------------------------------
  // canonical / og:url
  // ----------------------------------------------------------

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
    !isSharePath(
      declaredUrl
    ) &&
    !isLoginPath(
      declaredUrl
    )
  ) {

    return {
      success: true,

      resolvedUrl:
        declaredUrl,

      html,

      finalUrl,

      title:
        pageInfo.title,

      description:
        pageInfo.description,

      image:
        pageInfo.image,

      reason:
        "canonical/og:url resolved",
    };
  }


  // ----------------------------------------------------------
  // final URL
  // ----------------------------------------------------------

  if (
    finalUrl &&
    !isSharePath(
      finalUrl
    ) &&
    !isLoginPath(
      finalUrl
    ) &&
    looksLikePostUrl(
      finalUrl
    )
  ) {

    return {
      success: true,

      resolvedUrl:
        finalUrl,

      html,

      finalUrl,

      title:
        pageInfo.title,

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

    description:
      pageInfo.description,

    image:
      pageInfo.image,

    reason:
      isLoginPath(
        finalUrl
      )
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

  if (!html) {
    return "";
  }


  const candidates = [];


  // ----------------------------------------------------------
  // application/json
  // ----------------------------------------------------------

  const jsonScriptRegex =
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;


  let match;


  while (
    (match =
      jsonScriptRegex.exec(
        html
      )) !== null
  ) {

    const raw =
      match[1];


    if (!raw) {
      continue;
    }


    try {

      const json =
        JSON.parse(
          raw
        );


      walkVideoNodes(
        json,
        requestedId,
        candidates
      );

    } catch {
      // Fallback regex below
    }
  }


  // ----------------------------------------------------------
  // Raw HTML fallback
  // ----------------------------------------------------------

  extractRawVideoUrls(
    html,
    requestedId,
    candidates
  );


  // ----------------------------------------------------------
  // Sort
  // ----------------------------------------------------------

  candidates.sort(
    (a, b) => {

      if (
        b.score !==
        a.score
      ) {
        return (
          b.score -
          a.score
        );
      }


      if (
        a.isHd !==
        b.isHd
      ) {
        return a.isHd
          ? -1
          : 1;
      }


      return 0;
    }
  );


  // ----------------------------------------------------------
  // Return best
  // ----------------------------------------------------------

  for (
    const candidate
    of candidates
  ) {

    if (
      !candidate.url
    ) {
      continue;
    }


    const decoded =
      decodeEscapedUrl(
        candidate.url
      );


    if (
      /^https?:\/\//i.test(
        decoded
      ) &&
      /\.(mp4|m4v)(?:[?#]|$)/i.test(
        decoded
      )
    ) {
      return decoded;
    }


    if (
      /^https?:\/\//i.test(
        decoded
      ) &&
      /(?:video|fbcdn|scontent)/i.test(
        decoded
      )
    ) {
      return decoded;
    }
  }


  return "";
}


// ============================================================
// WALK JSON
// ============================================================

function walkVideoNodes(
  node,
  requestedId,
  candidates,
  depth = 0
) {

  if (
    !node ||
    depth > 30
  ) {
    return;
  }


  if (
    typeof node ===
    "string"
  ) {
    return;
  }


  if (
    Array.isArray(node)
  ) {

    for (
      const item
      of node
    ) {

      walkVideoNodes(
        item,
        requestedId,
        candidates,
        depth + 1
      );
    }

    return;
  }


  if (
    typeof node !==
    "object"
  ) {
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
  // Legacy
  // ----------------------------------------------------------

  const legacy =
    node.videoDeliveryLegacyFields;


  if (
    legacy &&
    typeof legacy ===
      "object"
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


  // ----------------------------------------------------------
  // Recursive
  // ----------------------------------------------------------

  for (
    const [
      key,
      value
    ] of Object.entries(
      node
    )
  ) {

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


// ============================================================
// ADD VIDEO CANDIDATE
// ============================================================

function addVideoCandidate(
  url,
  node,
  requestedId,
  candidates,
  isHd
) {

  if (
    !url ||
    typeof url !==
      "string"
  ) {
    return;
  }


  let score = 0;

  let serialized = "";


  try {

    serialized =
      JSON.stringify(
        node
      );

  } catch {

    serialized = "";
  }


  if (
    requestedId &&
    serialized &&
    serialized.includes(
      requestedId
    )
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
// RAW HTML VIDEO FALLBACK
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


  for (
    const key of keys
  ) {

    const regex =
      new RegExp(
        `"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
        "gi"
      );


    let match;


    while (
      (match =
        regex.exec(
          html
        )) !== null
    ) {

      const surroundingStart =
        Math.max(
          0,
          match.index -
            5000
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
        url:
          match[1],

        score,

        isHd:
          key ===
          "browser_native_hd_url",
      });
    }
  }


  // ----------------------------------------------------------
  // Loose format
  // ----------------------------------------------------------

  const looseRegex =
    /browser_native_(hd|sd)_url["']?\s*[:=]\s*["']((?:\\.|[^"\\])*)["']/gi;


  let looseMatch;


  while (
    (looseMatch =
      looseRegex.exec(
        html
      )) !== null
  ) {

    const type =
      looseMatch[1];


    const url =
      looseMatch[2];


    let score =
      type === "hd"
        ? 20
        : 0;


    const surroundingStart =
      Math.max(
        0,
        looseMatch.index -
          5000
      );


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
      surrounding.includes(
        requestedId
      )
    ) {
      score += 100;
    }


    candidates.push({
      url,

      score,

      isHd:
        type === "hd",
    });
  }
}


// ============================================================
// EXTRACT VIDEO ID
// ============================================================

function extractVideoId(
  url
) {

  if (!url) {
    return "";
  }


  const patterns = [
    /\/videos\/(\d+)/i,
    /\/video\/(\d+)/i,
    /\/reel\/(\d+)/i,
    /\/reels\/(\d+)/i,
  ];


  for (
    const regex
    of patterns
  ) {

    const match =
      url.match(
        regex
      );


    if (
      match?.[1]
    ) {
      return match[1];
    }
  }


  return "";
}


// ============================================================
// HTML PAGE
// ============================================================

function htmlPage(
  data
) {

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
    title ||
    "Facebook Video";


  const safeDescription =
    description ||
    "Facebook video converted by Facebed";


  const hasVideo =
    Boolean(
      videoUrl
    );


  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<title>${escapeHtml(
    safeTitle
  )}</title>


<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>


<meta
  name="description"
  content="${escapeHtml(
    safeDescription
  )}"
>


<!-- Open Graph -->

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


${
  image
    ? `<meta
  property="og:image"
  content="${escapeHtml(
    image
  )}"
>`
    : ""
}


${
  videoUrl
    ? `

<meta
  property="og:video"
  content="${escapeHtml(
    videoUrl
  )}"
>


<meta
  property="og:video:url"
  content="${escapeHtml(
    videoUrl
  )}"
>


<meta
  property="og:video:secure_url"
  content="${escapeHtml(
    videoUrl
  )}"
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


<!-- Twitter -->

<meta
  name="twitter:card"
  content="player"
>


<meta
  name="twitter:title"
  content="${escapeHtml(
    safeTitle
  )}"
>


<meta
  name="twitter:description"
  content="${escapeHtml(
    safeDescription
  )}"
>


<meta
  name="twitter:image"
  content="${escapeHtml(
    image || ""
  )}"
>


<meta
  name="twitter:player:stream"
  content="${escapeHtml(
    videoUrl
  )}"
>


<meta
  name="twitter:player:stream:content_type"
  content="video/mp4"
>
`
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

<h1>
${escapeHtml(
    safeTitle
  )}
</h1>


${
  hasVideo
    ? `<video
  class="video"
  controls
  preload="metadata"
  playsinline
  poster="${escapeHtml(
    image || ""
  )}"
>

  <source
    src="${escapeHtml(
      videoUrl
    )}"
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

<strong>
Status:
</strong>

<span
  class="${
    hasVideo
      ? "ok"
      : "error"
  }"
>

${
  hasVideo
    ? "VIDEO FOUND"
    : "VIDEO NOT FOUND"
}

</span>

</p>


<p>

<strong>
Resolve:
</strong>

${escapeHtml(
    reason || "-"
  )}

</p>


<p>

<strong>
Source:
</strong>

<br>

<a
  href="${escapeHtml(
    sourceUrl
  )}"
  target="_blank"
  rel="noopener"
>

${escapeHtml(
    sourceUrl
  )}

</a>

</p>


${
  resolvedUrl
    ? `<p>

<strong>
Resolved:
</strong>

<br>

<a
  href="${escapeHtml(
    resolvedUrl
  )}"
  target="_blank"
  rel="noopener"
>

${escapeHtml(
    resolvedUrl
  )}

</a>

</p>`
    : ""
}


${
  videoUrl
    ? `<p>

<strong>
Video URL:
</strong>

<br>

<code>
${escapeHtml(
    videoUrl
  )}
</code>

</p>`
    : ""
}

</div>

</div>

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
// WORKER
// ============================================================

export default {

  async fetch(
    request
  ) {

    const requestUrl =
      new URL(
        request.url
      );


    // ========================================================
    // HOME
    // ========================================================

    if (
      requestUrl.pathname === "/" &&
      !requestUrl.searchParams.has(
        "url"
      )
    ) {

      const html =
`<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>
C2Z Facebed
</title>

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

<h1>
C2Z Facebed
</h1>

<p>
Facebook → Discord video resolver
</p>


<h3>
Supported URL styles
</h3>

<p>
<code>
/share/r/xxxxx
</code>
</p>

<p>
<code>
/share/p/xxxxx
</code>
</p>

<p>
<code>
/share/v/xxxxx
</code>
</p>

<p>
<code>
/username/posts/xxxxx
</code>
</p>

<p>
<code>
/groups/xxxxx/posts/xxxxx
</code>
</p>

<p>
<code>
/groups/xxxxx/permalink/xxxxx
</code>
</p>

<p>
<code>
/reel/xxxxx
</code>
</p>

<p>
<code>
/watch?v=xxxxx
</code>
</p>

<p>
<code>
/story.php?story_fbid=xxxxx
</code>
</p>

<p>
<code>
/permalink.php?story_fbid=xxxxx
</code>
</p>


<h3>
Full Facebook URL
</h3>

<p>
<code>
/https://www.facebook.com/share/r/xxxxx/
</code>
</p>


<h3>
Discord Video
</h3>

<p>
<code>
/video?url=FACEBOOK_URL
</code>
</p>

</div>

</body>

</html>`;


      return new Response(
        html,
        {
          headers: {
            "Content-Type":
              "text/html; charset=UTF-8",

            "Cache-Control":
              "no-store",
          },
        }
      );
    }


    // ========================================================
    // FULL FACEBOOK URL IN PATH
    //
    // /https://www.facebook.com/share/r/xxxxx/
    //
    // IMPORTANT:
    // This returns our OG HTML page,
    // NOT a direct redirect to Facebook.
    // ========================================================

    const embeddedFacebookUrl =
      extractFacebookUrlFromPath(
        requestUrl
      );


    if (
      embeddedFacebookUrl
    ) {

      console.log(
        "Embedded Facebook URL:",
        embeddedFacebookUrl
      );


      try {

        const resolved =
          await resolveFacebookShare(
            embeddedFacebookUrl
          );


        if (
          !resolved.success
        ) {

          return new Response(
            htmlPage({
              sourceUrl:
                embeddedFacebookUrl,

              resolvedUrl:
                resolved.resolvedUrl ||
                "",

              videoUrl: "",

              title:
                resolved.title ||
                "Facebook",

              description:
                resolved.description ||
                resolved.reason ||
                "Facebook",

              image:
                resolved.image ||
                "",

              reason:
                resolved.reason ||
                "Could not resolve Facebook URL",
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
        }


        // ----------------------------------------------------
        // Find video
        // ----------------------------------------------------

        let videoUrl =
          extractFacebookVideoUrl(
            resolved.html,

            extractVideoId(
              resolved.resolvedUrl
            )
          );


        // ----------------------------------------------------
        // Fetch resolved page if needed
        // ----------------------------------------------------

        if (
          !videoUrl &&
          resolved.resolvedUrl
        ) {

          const videoResponse =
            await fetch(
              resolved.resolvedUrl,
              {
                method:
                  "GET",

                redirect:
                  "follow",

                headers:
                  FACEBOOK_HEADERS,
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


        // ----------------------------------------------------
        // Our video endpoint
        // ----------------------------------------------------

        let discordVideoUrl =
          "";


        if (
          videoUrl
        ) {

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
              resolved.title ||
              "Facebook Video",

            description:
              resolved.description ||
              "Facebook video",

            image:
              resolved.image ||
              "",

            reason:
              resolved.reason ||
              "resolved",
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

      } catch (
        error
      ) {

        console.log(
          "Embedded URL error:",
          error?.stack ||
            error?.message ||
            error
        );


        return errorResponse(
          "Embedded URL resolver error",
          500
        );
      }
    }


    // ========================================================
    // FACEBED STYLE ROUTES
    //
    // IMPORTANT:
    // Do NOT redirect to Facebook.
    //
    // Return OG metadata instead.
    // This is what Discord needs.
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


      console.log(
        "Facebed route:",
        facebookUrl
      );


      try {

        const resolved =
          await resolveFacebookShare(
            facebookUrl
          );


        if (
          !resolved.success
        ) {

          return new Response(
            htmlPage({
              sourceUrl:
                facebookUrl,

              resolvedUrl:
                "",

              videoUrl:
                "",

              title:
                resolved.title ||
                "Facebook",

              description:
                resolved.description ||
                resolved.reason ||
                "Facebook",

              image:
                resolved.image ||
                "",

              reason:
                resolved.reason ||
                "Could not resolve Facebook URL",
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
        }


        // ----------------------------------------------------
        // Find video
        // ----------------------------------------------------

        let videoUrl =
          extractFacebookVideoUrl(
            resolved.html,

            extractVideoId(
              resolved.resolvedUrl
            )
          );


        // ----------------------------------------------------
        // Fetch resolved page if needed
        // ----------------------------------------------------

        if (
          !videoUrl &&
          resolved.resolvedUrl
        ) {

          console.log(
            "Video not found on share page."
          );


          console.log(
            "Fetching resolved page:",
            resolved.resolvedUrl
          );


          const videoResponse =
            await fetch(
              resolved.resolvedUrl,
              {
                method:
                  "GET",

                redirect:
                  "follow",

                headers:
                  FACEBOOK_HEADERS,
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
          "Facebed route video:",
          videoUrl
            ? "FOUND"
            : "NOT FOUND"
        );


        // ----------------------------------------------------
        // IMPORTANT
        //
        // Discord receives:
        //
        // /video?url=FACEBOOK_URL
        //
        // NOT the temporary Facebook CDN URL.
        // ----------------------------------------------------

        let discordVideoUrl =
          "";


        if (
          videoUrl
        ) {

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


        // ----------------------------------------------------
        // Return OG page
        // ----------------------------------------------------

        return new Response(
          htmlPage({
            sourceUrl:
              facebookUrl,

            resolvedUrl:
              resolved.resolvedUrl,

            videoUrl:
              discordVideoUrl,

            title:
              resolved.title ||
              "Facebook Video",

            description:
              resolved.description ||
              "Facebook video",

            image:
              resolved.image ||
              "",

            reason:
              resolved.reason ||
              "resolved",
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

      } catch (
        error
      ) {

        console.log(
          "Facebed route error:",
          error?.stack ||
            error?.message ||
            error
        );


        return errorResponse(
          "Facebed route error",
          500
        );
      }
    }


    // ========================================================
    // ?url= FACEBOOK URL
    // ========================================================

    const sourceUrl =
      requestUrl.searchParams.get(
        "url"
      );


    if (
      !sourceUrl
    ) {

      return errorResponse(
        "Missing ?url= parameter"
      );
    }


    let facebookUrl;


    try {

      facebookUrl =
        decodeURIComponent(
          sourceUrl
        );

    } catch {

      facebookUrl =
        sourceUrl;
    }


    if (
      !isFacebookUrl(
        facebookUrl
      )
    ) {

      return errorResponse(
        "Only Facebook URLs are supported",
        400
      );
    }


    // ========================================================
    // /video
    //
    // Facebook → MP4 → 302
    //
    // Discord uses this as the actual video source.
    // ========================================================

    if (
      requestUrl.pathname ===
      "/video"
    ) {

      console.log(
        "Video request:",
        facebookUrl
      );


      try {

        const resolved =
          await resolveFacebookShare(
            facebookUrl
          );


        if (
          !resolved.success
        ) {

          return errorResponse(
            resolved.reason ||
              "Could not resolve Facebook URL",
            404
          );
        }


        // ----------------------------------------------------
        // Try share page
        // ----------------------------------------------------

        let videoUrl =
          extractFacebookVideoUrl(
            resolved.html,

            extractVideoId(
              resolved.resolvedUrl
            )
          );


        // ----------------------------------------------------
        // Try resolved page
        // ----------------------------------------------------

        if (
          !videoUrl &&
          resolved.resolvedUrl
        ) {

          console.log(
            "Fetching resolved page:",
            resolved.resolvedUrl
          );


          const videoResponse =
            await fetch(
              resolved.resolvedUrl,
              {
                method:
                  "GET",

                redirect:
                  "follow",

                headers:
                  FACEBOOK_HEADERS,
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


        if (
          !videoUrl
        ) {

          return errorResponse(
            "Video URL not found",
            404
          );
        }


        console.log(
          "Video URL FOUND"
        );


        // ----------------------------------------------------
        // 302 → Facebook CDN
        // ----------------------------------------------------

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

      } catch (
        error
      ) {

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
    // NORMAL ?url= RESOLVER
    //
    // Example:
    //
    // /?url=https://www.facebook.com/share/r/xxxxx/
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


      if (
        !resolved.success
      ) {

        return new Response(
          htmlPage({
            sourceUrl:
              facebookUrl,

            resolvedUrl:
              resolved.resolvedUrl ||
              "",

            videoUrl:
              "",

            title:
              resolved.title ||
              "Facebook",

            description:
              resolved.description ||
              resolved.reason ||
              "Facebook",

            image:
              resolved.image ||
              "",

            reason:
              resolved.reason ||
              "Could not resolve Facebook URL",
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
      // Find video
      // ------------------------------------------------------

      let videoUrl =
        extractFacebookVideoUrl(
          resolved.html,

          extractVideoId(
            resolved.resolvedUrl
          )
        );


      // ------------------------------------------------------
      // Fetch resolved page if needed
      // ------------------------------------------------------

      if (
        !videoUrl &&
        resolved.resolvedUrl
      ) {

        const videoResponse =
          await fetch(
            resolved.resolvedUrl,
            {
              method:
                "GET",

              redirect:
                "follow",

              headers:
                FACEBOOK_HEADERS,
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


      // ------------------------------------------------------
      // Browser page should use direct CDN URL.
      // Discord-specific routes use /video.
      // ------------------------------------------------------

      return new Response(
        htmlPage({
          sourceUrl:
            facebookUrl,

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
            resolved.image ||
            "",

          reason:
            resolved.reason ||
            "resolved",
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

    } catch (
      error
    ) {

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