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


/* =========================================================
 * Basic helpers
 * ======================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

    return /^\/share(?:\/|$)/i.test(
      url.pathname
    );
  } catch {
    return /^\/?share(?:\/|$)/i.test(value);
  }
}


function isLoginPath(value) {
  try {
    const url = new URL(value);

    return /^\/login(?:\/|$)/i.test(
      url.pathname
    );
  } catch {
    return false;
  }
}


function makeAbsoluteUrl(value, baseUrl) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}


/* =========================================================
 * HTML metadata
 * ======================================================= */

function getMeta(html, property) {
  const escaped =
    property.replace(
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
      return decodeHtmlEntities(
        match[1].trim()
      );
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
      return decodeHtmlEntities(
        match[1].trim()
      );
    }
  }

  return "";
}


/* =========================================================
 * Facebook URL detection
 * ======================================================= */

function looksLikePostUrl(value) {
  try {
    const url = new URL(value);
    const path =
      url.pathname.toLowerCase();

    if (!isFacebookUrl(value)) {
      return false;
    }

    if (
      isSharePath(value) ||
      isLoginPath(value)
    ) {
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


/* =========================================================
 * Inspect Facebook page
 * ======================================================= */

function inspectFacebookPage(
  html,
  responseUrl
) {
  const canonical =
    getCanonical(html);

  const ogUrl =
    getMeta(html, "og:url");

  const candidates = [
    makeAbsoluteUrl(
      canonical,
      responseUrl
    ),

    makeAbsoluteUrl(
      ogUrl,
      responseUrl
    ),

    responseUrl
  ].filter(Boolean);

  let selectedUrl =
    responseUrl;

  let declaredTarget =
    false;

  for (const candidate of candidates) {
    if (
      looksLikePostUrl(candidate)
    ) {
      selectedUrl =
        candidate;

      declaredTarget =
        true;

      break;
    }
  }

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


/* =========================================================
 * Resolve Facebook /share/ URL
 * ======================================================= */

async function resolveFacebookShare(
  sourceUrl
) {
  let headResponse = null;


  /* -------------------------------------------------------
   * HEAD
   * ----------------------------------------------------- */

  try {
    headResponse =
      await fetch(
        sourceUrl,
        {
          method: "HEAD",
          redirect: "follow",

          headers: {
            "User-Agent":
              FACEBOOK_UA,

            "Accept-Language":
              "en-US,en;q=0.9",

            "Cache-Control":
              "no-cache",

            "Pragma":
              "no-cache"
          }
        }
      );
  } catch (error) {
    console.log(
      "HEAD failed:",
      String(error)
    );
  }


  if (headResponse) {
    const headUrl =
      headResponse.url;

    console.log(
      "HEAD status:",
      headResponse.status
    );

    console.log(
      "HEAD final URL:",
      headUrl
    );


    /*
     * If HEAD already resolved
     * to an actual Facebook video/post.
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
        status:
          headResponse.status,
        method: "HEAD",
        reason:
          "HEAD resolved directly"
      };
    }
  }


  /* -------------------------------------------------------
   * GET original share URL
   * ----------------------------------------------------- */

  let response;

  try {
    response =
      await fetch(
        sourceUrl,
        {
          method: "GET",
          redirect: "follow",
          headers:
            FACEBOOK_HEADERS,
          cache: "no-store"
        }
      );
  } catch (error) {
    throw new Error(
      "Facebook GET failed: " +
      String(error)
    );
  }


  const html =
    await response.text();


  console.log(
    "GET status:",
    response.status
  );

  console.log(
    "GET final URL:",
    response.url
  );

  console.log(
    "HTML length:",
    html.length
  );


  /* -------------------------------------------------------
   * Inspect canonical / og:url
   * ----------------------------------------------------- */

  const inspected =
    inspectFacebookPage(
      html,
      response.url
    );


  console.log({
    sourceUrl,
    finalUrl:
      response.url,

    selectedUrl:
      inspected.selectedUrl,

    canonical:
      inspected.canonical,

    ogUrl:
      inspected.ogUrl,

    declaredTarget:
      inspected.declaredTarget
  });


  /*
   * canonical / og:url gave us
   * an actual post/video URL.
   */
  if (
    inspected.declaredTarget
  ) {
    return {
      sourceUrl,

      resolvedUrl:
        inspected.selectedUrl,

      response,

      html,

      status:
        response.status,

      method:
        "GET",

      reason:
        "canonical/og:url resolved"
    };
  }


  /*
   * Final redirected URL itself
   * is a usable Facebook video URL.
   */
  if (
    looksLikePostUrl(
      response.url
    )
  ) {
    return {
      sourceUrl,

      resolvedUrl:
        response.url,

      response,

      html,

      status:
        response.status,

      method:
        "GET",

      reason:
        "final URL resolved"
    };
  }


  /*
   * Facebook kept us at /share/
   */
  if (
    isSharePath(
      response.url
    )
  ) {
    return {
      sourceUrl,

      resolvedUrl:
        null,

      response,

      html,

      status:
        response.status,

      method:
        "GET",

      reason:
        "Facebook left share URL unresolved"
    };
  }


  /*
   * Facebook redirected to login.
   */
  if (
    isLoginPath(
      response.url
    )
  ) {
    return {
      sourceUrl,

      resolvedUrl:
        null,

      response,

      html,

      status:
        response.status,

      method:
        "GET",

      reason:
        "Facebook redirected to login"
    };
  }


  return {
    sourceUrl,

    resolvedUrl:
      null,

    response,

    html,

    status:
      response.status,

    method:
      "GET",

    reason:
      "No usable Facebook post URL found"
  };
}


/* =========================================================
 * Extract Facebook video URL
 *
 * Based on Facebed ReelsParser:
 *
 * browser_native_hd_url
 * browser_native_sd_url
 * videoDeliveryLegacyFields
 * ======================================================= */

function extractFacebookVideoUrl(
  html,
  requestedId = ""
) {
  const scripts = [];


  /*
   * Facebook embeds data inside:
   *
   * <script type="application/json">
   *
   * Facebed also parses application/json
   * blocks from the Facebook page.
   */

  const scriptRegex =
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;


  while (
    (match =
      scriptRegex.exec(html)) !== null
  ) {
    scripts.push(
      match[1]
    );
  }


  const candidates = [];


  /*
   * Recursively search JSON.
   */
  function walk(value) {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }


    if (
      Array.isArray(value)
    ) {
      for (
        const item of value
      ) {
        walk(item);
      }

      return;
    }


    const hasHD =
      typeof value.browser_native_hd_url ===
        "string" &&
      value.browser_native_hd_url.length >
        0;


    const hasSD =
      typeof value.browser_native_sd_url ===
        "string" &&
      value.browser_native_sd_url.length >
        0;


    let videoUrl =
      "";


    /*
     * Prefer HD.
     */
    if (hasHD) {
      videoUrl =
        value.browser_native_hd_url;
    }


    /*
     * Fallback SD.
     */
    else if (hasSD) {
      videoUrl =
        value.browser_native_sd_url;
    }


    /*
     * Facebed fallback:
     *
     * videoDeliveryLegacyFields
     */
    if (
      !videoUrl &&
      value.videoDeliveryLegacyFields
    ) {
      const legacy =
        value.videoDeliveryLegacyFields;


      if (
        typeof legacy.browser_native_hd_url ===
          "string" &&
        legacy.browser_native_hd_url
      ) {
        videoUrl =
          legacy.browser_native_hd_url;
      }


      else if (
        typeof legacy.browser_native_sd_url ===
          "string" &&
        legacy.browser_native_sd_url
      ) {
        videoUrl =
          legacy.browser_native_sd_url;
      }
    }


    if (videoUrl) {
      const serialized =
        JSON.stringify(value);


      let score =
        0;


      /*
       * Prefer JSON node containing
       * the requested video ID.
       */
      if (
        requestedId &&
        serialized.includes(
          String(requestedId)
        )
      ) {
        score += 100;
      }


      /*
       * Prefer HD.
       */
      if (hasHD) {
        score += 20;
      }


      candidates.push({
        url: videoUrl,
        score,
        size:
          serialized.length
      });
    }


    /*
     * Continue recursively.
     */
    for (
      const child of
        Object.values(value)
    ) {
      walk(child);
    }
  }


  /*
   * Parse all application/json blocks.
   */
  for (
    const script of scripts
  ) {
    try {
      const json =
        JSON.parse(script);

      walk(json);
    } catch {
      /*
       * Ignore invalid JSON blocks.
       */
    }
  }


  /*
   * Highest score first.
   *
   * If same score:
   * smaller node first.
   */
  candidates.sort(
    (a, b) => {
      if (
        b.score !== a.score
      ) {
        return (
          b.score - a.score
        );
      }

      return (
        a.size - b.size
      );
    }
  );


  return (
    candidates[0]?.url ||
    ""
  );
}


/* =========================================================
 * HTML output
 * ======================================================= */

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
    ogUrl,
    videoUrl
  } = data;


  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<title>
${escapeHtml(
  title || "C2Z Facebed"
)}
</title>


${
  title
    ? `
<meta
  property="og:title"
  content="${escapeHtml(title)}"
>
`
    : ""
}


${
  description
    ? `
<meta
  property="og:description"
  content="${escapeHtml(description)}"
>
`
    : ""
}


${
  image
    ? `
<meta
  property="og:image"
  content="${escapeHtml(image)}"
>
`
    : ""
}


${
  resolvedUrl
    ? `
<meta
  property="og:url"
  content="${escapeHtml(resolvedUrl)}"
>
`
    : ""
}


<meta
  property="og:type"
  content="video.other"
>


${
  videoUrl
    ? `
<meta
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
`
    : ""
}


<meta
  name="twitter:card"
  content="summary_large_image"
>


<meta
  name="twitter:title"
  content="${escapeHtml(
    title || "C2Z Facebed"
  )}"
>


${
  description
    ? `
<meta
  name="twitter:description"
  content="${escapeHtml(description)}"
>
`
    : ""
}


${
  image
    ? `
<meta
  name="twitter:image"
  content="${escapeHtml(image)}"
>
`
    : ""
}


</head>


<body>

<h1>C2Z Facebed</h1>

<hr>


<p>
<b>Status:</b>
Facebook HTTP
${escapeHtml(status)}
</p>


<p>
<b>Method:</b>
${escapeHtml(method)}
</p>


<p>
<b>Reason:</b>
${escapeHtml(reason)}
</p>


<p>
<b>Source:</b>
<br>
${escapeHtml(sourceUrl)}
</p>


<p>
<b>Resolved URL:</b>
<br>

${
  resolvedUrl
    ? escapeHtml(resolvedUrl)
    : "NOT RESOLVED"
}

</p>


<p>
<b>Canonical:</b>
<br>

${
  canonical
    ? escapeHtml(canonical)
    : "NONE"
}

</p>


<p>
<b>og:url:</b>
<br>

${
  ogUrl
    ? escapeHtml(ogUrl)
    : "NONE"
}

</p>


<p>
<b>Title:</b>
<br>

${escapeHtml(
  title || "NONE"
)}

</p>


${
  description
    ? `
<p>
<b>Description:</b>
<br>
${escapeHtml(description)}
</p>
`
    : ""
}


${
  image
    ? `
<p>
<b>Image:</b>
<br>
${escapeHtml(image)}
</p>
`
    : ""
}


<hr>


${
  videoUrl
    ? `
<h2>Video</h2>

<p>
<b>Video URL:</b>
<br>
${escapeHtml(videoUrl)}
</p>

<video
  controls
  preload="metadata"
  playsinline
  style="
    max-width: 800px;
    width: 100%;
    height: auto;
  "
>

<source
  src="${escapeHtml(videoUrl)}"
  type="video/mp4"
>

Your browser does not support
the video element.

</video>
`
    : `
<h2>Video</h2>

<p>
<b>Video URL:</b>
NOT FOUND
</p>
`
}


</body>

</html>`;
}


/* =========================================================
 * Worker
 * ======================================================= */

export default {

  async fetch(request) {

    const requestUrl =
      new URL(request.url);


    /* -----------------------------------------------------
     * Home
     * --------------------------------------------------- */

    if (
      requestUrl.pathname === "/" &&
      !requestUrl.searchParams.has(
        "url"
      )
    ) {

      return new Response(
        "C2Z Facebed Worker\n\n" +
        "Usage:\n" +
        "https://fb.c2z.top/?url=FACEBOOK_URL",
        {
          headers: {
            "content-type":
              "text/plain; charset=UTF-8"
          }
        }
      );
    }


    /* -----------------------------------------------------
     * Get ?url=
     * --------------------------------------------------- */

    const targetUrl =
      requestUrl.searchParams.get(
        "url"
      );


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


    /* -----------------------------------------------------
     * Validate URL
     * --------------------------------------------------- */

    let facebookUrl;


    try {

      facebookUrl =
        new URL(targetUrl);

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


    /* -----------------------------------------------------
     * Only Facebook
     * --------------------------------------------------- */

    if (
      !isFacebookUrl(
        facebookUrl.toString()
      )
    ) {

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

      /* ---------------------------------------------------
       * Resolve share URL
       * ------------------------------------------------- */

      const result =
        await resolveFacebookShare(
          facebookUrl.toString()
        );


      /* ---------------------------------------------------
       * Inspect resolved page
       * ------------------------------------------------- */

      const inspected =
        inspectFacebookPage(
          result.html || "",

          result.response?.url ||
            result.resolvedUrl ||
            facebookUrl.toString()
        );


      /* ---------------------------------------------------
       * Extract video ID
       *
       * Example:
       *
       * /videos/1113034145008742/
       *
       * -> 1113034145008742
       * ------------------------------------------------- */

      let videoId =
        "";


      const resolvedForId =
        result.resolvedUrl ||
        "";


      const videoIdMatch =
        resolvedForId.match(
          /\/videos\/(\d+)/i
        );


      if (videoIdMatch) {

        videoId =
          videoIdMatch[1];
      }


      /*
       * Also support /reel/<id>
       */
      if (!videoId) {

        const reelIdMatch =
          resolvedForId.match(
            /\/reel\/(\d+)/i
          );


        if (reelIdMatch) {

          videoId =
            reelIdMatch[1];
        }
      }


      console.log({
        resolvedUrl:
          result.resolvedUrl,

        videoId
      });


      /* ---------------------------------------------------
       * First attempt:
       *
       * Use HTML we already downloaded.
       * ------------------------------------------------- */

      let videoUrl =
        extractFacebookVideoUrl(
          result.html || "",
          videoId
        );


      let resolvedHtml =
        result.html || "";


      /* ---------------------------------------------------
       * Second attempt:
       *
       * Fetch resolved video page.
       *
       * This is necessary when /share/r/
       * page only gives us canonical/og:url.
       * ------------------------------------------------- */

      if (
        !videoUrl &&
        result.resolvedUrl
      ) {

        try {

          const videoPage =
            await fetch(
              result.resolvedUrl,
              {
                method: "GET",

                redirect:
                  "follow",

                headers:
                  FACEBOOK_HEADERS,

                cache:
                  "no-store"
              }
            );


          resolvedHtml =
            await videoPage.text();


          console.log(
            "Resolved video page status:",
            videoPage.status
          );


          console.log(
            "Resolved video page URL:",
            videoPage.url
          );


          console.log(
            "Resolved video HTML length:",
            resolvedHtml.length
          );


          videoUrl =
            extractFacebookVideoUrl(
              resolvedHtml,
              videoId
            );

        } catch (error) {

          console.log(
            "Resolved video fetch failed:",
            String(error)
          );
        }
      }


      /* ---------------------------------------------------
       * Third attempt:
       *
       * If the second request got useful metadata,
       * inspect it too.
       * ------------------------------------------------- */

      if (
        !inspected.title &&
        resolvedHtml
      ) {

        const resolvedInspected =
          inspectFacebookPage(
            resolvedHtml,

            result.resolvedUrl ||
              facebookUrl.toString()
          );


        if (
          resolvedInspected.title
        ) {
          inspected.title =
            resolvedInspected.title;
        }


        if (
          resolvedInspected.description
        ) {
          inspected.description =
            resolvedInspected.description;
        }


        if (
          resolvedInspected.image
        ) {
          inspected.image =
            resolvedInspected.image;
        }
      }


      /* ---------------------------------------------------
       * Debug
       * ------------------------------------------------- */

      console.log({
        sourceUrl:
          result.sourceUrl,

        resolvedUrl:
          result.resolvedUrl,

        videoId,

        videoUrl:
          videoUrl
            ? "FOUND"
            : "NOT FOUND"
      });


      /* ---------------------------------------------------
       * Return result
       * ------------------------------------------------- */

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
            inspected.ogUrl,

          videoUrl
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

<title>
C2Z Facebed Error
</title>

</head>

<body>

<h1>
C2Z Facebed
</h1>

<p>
<b>Error</b>
</p>

<pre>
${escapeHtml(
  String(error)
)}
</pre>

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