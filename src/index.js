const FACEBOOK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/146.0.0.0 Safari/537.36";

const FACEBOOK_HEADERS = {
  "User-Agent": FACEBOOK_UA,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

/*
 * เปลี่ยนตรงนี้ได้ถ้าอยากให้ชื่อ service เป็นอย่างอื่น
 *
 * Facebed ของต้นฉบับใช้:
 *   facebed by pi.kt
 *
 * ของเราจะใช้:
 *   faced by C2Z
 */
const CREDIT = "faced by C2Z";


/* =========================================================
 * Facebook reaction
 * ========================================================= */

const FACEBOOK_REACTION_EMOJIS = {
  "1635855486666999": "👍",
  "1678524932434102": "❤️",
  "613557422527858": "🤗",
  "115940658764963": "😂",
  "478547315650144": "😮",
  "908563459236466": "😢",
  "444813342392137": "😡",
};

const FACEBOOK_REACTION_NAME_IDS = {
  like: "1635855486666999",
  love: "1678524932434102",
  care: "613557422527858",
  haha: "115940658764963",
  wow: "478547315650144",
  sad: "908563459236466",
  angry: "444813342392137",
};


/* =========================================================
 * Basic helpers
 * ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function decodeHtmlEntities(value) {
  if (!value) return "";

  return String(value)
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function decodeEscapedUrl(value) {
  if (!value) return "";

  let result = decodeHtmlEntities(String(value));

  result = result
    .replace(/\\u0025/gi, "%")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u003a/gi, ":")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');

  return result;
}

function cleanText(value) {
  if (value == null) return "";

  return decodeHtmlEntities(String(value))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPostText(value) {
  if (value == null) return "";

  return decodeHtmlEntities(String(value))
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function isFacebookLoginUrl(value) {
  try {
    const u = new URL(value);

    return (
      /facebook\.com$/i.test(u.hostname) &&
      /^\/(?:login|checkpoint|recover|reg|unsupportedbrowser)/i.test(
        u.pathname
      )
    );
  } catch {
    return false;
  }
}

function makeAbsoluteUrl(
  value,
  base = "https://www.facebook.com/"
) {
  if (!value) return "";

  try {
    return new URL(
      decodeEscapedUrl(value),
      base
    ).href;
  } catch {
    return decodeEscapedUrl(value);
  }
}


/* =========================================================
 * HTML meta helpers
 * ========================================================= */

function getMeta(html, property) {
  const escaped = property.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i"
  );

  const match1 = html.match(re1);

  if (match1) {
    return cleanText(match1[1]);
  }

  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    "i"
  );

  const match2 = html.match(re2);

  return match2
    ? cleanText(match2[1])
    : "";
}

function getCanonical(html) {
  const match1 = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
  );

  if (match1) {
    return makeAbsoluteUrl(match1[1]);
  }

  const match2 = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i
  );

  return match2
    ? makeAbsoluteUrl(match2[1])
    : "";
}

function getHtmlTitle(html) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return match
    ? cleanText(match[1])
    : "";
}


/* =========================================================
 * JSON parser
 * ========================================================= */

function getJsonBlocks(html) {
  const blocks = [];

  const re =
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim();

    if (!raw) continue;

    try {
      blocks.push(JSON.parse(raw));
      continue;
    } catch {}

    try {
      blocks.push(
        JSON.parse(
          decodeHtmlEntities(raw)
        )
      );
    } catch {}
  }

  return blocks;
}

function walk(value, callback, path = []) {
  if (value == null) return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      callback(value[i], path.concat(i));
      walk(value[i], callback, path.concat(i));
    }

    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      callback(child, path.concat(key));
      walk(child, callback, path.concat(key));
    }
  }
}

function containsTarget(value, targetIds) {
  if (
    !targetIds ||
    !targetIds.length ||
    value == null
  ) {
    return false;
  }

  let text = "";

  try {
    text = JSON.stringify(value);
  } catch {
    return false;
  }

  return targetIds.some(
    id => id && text.includes(String(id))
  );
}

function containsExactId(value, targetIds) {
  if (
    !targetIds ||
    !targetIds.length ||
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const id =
    value.id == null
      ? ""
      : String(value.id);

  return targetIds.some(
    target => id === String(target)
  );
}


/* =========================================================
 * Target IDs
 * ========================================================= */

function getTargetIds(url) {
  const ids = [];

  try {
    const u = new URL(url);

    const add = value => {
      if (
        value &&
        /^\d{5,}$/.test(String(value)) &&
        !ids.includes(String(value))
      ) {
        ids.push(String(value));
      }
    };

    add(u.searchParams.get("v"));
    add(u.searchParams.get("fbid"));
    add(u.searchParams.get("story_fbid"));
    add(u.searchParams.get("id"));

    const parts =
      u.pathname
        .split("/")
        .filter(Boolean);

    for (
      let i = parts.length - 1;
      i >= 0;
      i--
    ) {
      if (/^\d{5,}$/.test(parts[i])) {
        add(parts[i]);
      }
    }
  } catch {}

  return ids;
}


/* =========================================================
 * Find Facebook video/content node
 * ========================================================= */

function findContentNode(blocks, targetIds) {
  const candidates = [];

  for (const block of blocks) {
    walk(block, node => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      if (
        node.short_form_video_context ||
        node.video_owner ||
        node.creation_time ||
        node.browser_native_hd_url ||
        node.browser_native_sd_url
      ) {
        candidates.push(node);
      }
    });
  }

  const exact =
    candidates.find(
      node => containsExactId(node, targetIds)
    );

  if (exact) return exact;

  const targeted =
    candidates.find(
      node => containsTarget(node, targetIds)
    );

  if (targeted) return targeted;


  /*
   * Facebed ReelsParser ให้ความสำคัญกับ:
   *
   * creation_story
   * short_form_video_context
   */
  const special = [];

  for (const block of blocks) {
    walk(block, node => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      if (node.creation_story) {
        special.push(node.creation_story);
      }

      if (node.short_form_video_context) {
        special.push(
          node.short_form_video_context
        );
      }
    });
  }

  const exactSpecial =
    special.find(
      node => containsExactId(node, targetIds)
    );

  if (exactSpecial) return exactSpecial;

  const targetSpecial =
    special.find(
      node => containsTarget(node, targetIds)
    );

  if (targetSpecial) return targetSpecial;

  return null;
}


/* =========================================================
 * Video URL
 * ========================================================= */

function findVideoNode(blocks, targetIds) {
  const candidates = [];

  for (const block of blocks) {
    walk(block, node => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      if (
        node.browser_native_hd_url ||
        node.browser_native_sd_url ||
        node.videoDeliveryLegacyFields
      ) {
        candidates.push(node);
      }
    });
  }

  const exact =
    candidates
      .filter(
        node => containsExactId(node, targetIds)
      )
      .sort(
        (a, b) =>
          JSON.stringify(a).length -
          JSON.stringify(b).length
      );

  const targeted =
    candidates
      .filter(
        node => containsTarget(node, targetIds)
      )
      .sort(
        (a, b) =>
          JSON.stringify(a).length -
          JSON.stringify(b).length
      );

  return (
    exact[0] ||
    targeted[0] ||
    candidates[0] ||
    null
  );
}

function extractFacebookVideoUrl(
  html,
  targetIds = []
) {
  const blocks =
    getJsonBlocks(html);

  const node =
    findVideoNode(
      blocks,
      targetIds
    );

  const readVideo = candidate => {
    if (
      !candidate ||
      typeof candidate !== "object"
    ) {
      return "";
    }

    const direct =
      candidate.browser_native_hd_url ||
      candidate.browser_native_sd_url ||
      "";

    if (direct) {
      return decodeEscapedUrl(
        direct
      );
    }

    const legacy =
      candidate.videoDeliveryLegacyFields;

    if (
      legacy &&
      typeof legacy === "object"
    ) {
      return decodeEscapedUrl(
        legacy.browser_native_hd_url ||
        legacy.browser_native_sd_url ||
        ""
      );
    }

    return "";
  };

  let result =
    readVideo(node);

  if (result) return result;


  /*
   * Fallback:
   * HD ก่อน SD เหมือน Facebed
   */
  for (const block of blocks) {
    const nodes = [block];

    walk(block, item => {
      nodes.push(item);
    });

    for (const item of nodes) {
      const url =
        readVideo(item);

      if (url) return url;
    }
  }


  /*
   * Last fallback
   */
  const patterns = [
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/i,
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match =
      html.match(pattern);

    if (match) {
      return decodeEscapedUrl(
        match[1]
      );
    }
  }

  return "";
}


/* =========================================================
 * Author / poster
 *
 * Facebed:
 * short_form_video_context.video_owner
 * video_owner
 * actors
 * ========================================================= */

function getOwnerFromNode(node) {
  if (
    !node ||
    typeof node !== "object"
  ) {
    return null;
  }

  const context =
    node.short_form_video_context &&
    typeof node.short_form_video_context === "object"
      ? node.short_form_video_context
      : node;

  const directCandidates = [
    context.video_owner,
    node.video_owner,
    context.owner,
    node.owner,
    context.author,
    node.author,
  ];

  for (
    const owner of directCandidates
  ) {
    if (
      owner &&
      typeof owner === "object"
    ) {
      const name =
        cleanText(
          owner.name ||
          owner.short_name ||
          owner.username
        );

      if (!name) continue;

      return {
        name,
        id: owner.id
          ? String(owner.id)
          : "",
        url:
          makeAbsoluteUrl(
            owner.url ||
            owner.profile_url ||
            "",
            "https://www.facebook.com/"
          ),
      };
    }
  }

  const actors =
    context.actors ||
    node.actors;

  if (Array.isArray(actors)) {
    const actor =
      actors.find(
        item =>
          item &&
          typeof item === "object" &&
          cleanText(
            item.name ||
            item.short_name ||
            item.username
          )
      );

    if (actor) {
      return {
        name: cleanText(
          actor.name ||
          actor.short_name ||
          actor.username
        ),
        id: actor.id
          ? String(actor.id)
          : "",
        url:
          makeAbsoluteUrl(
            actor.url ||
            actor.profile_url ||
            "",
            "https://www.facebook.com/"
          ),
      };
    }
  }

  return null;
}

function extractAuthor(
  blocks,
  targetIds,
  contentNode
) {
  /*
   * ลอง content node ก่อน
   */
  const direct =
    getOwnerFromNode(
      contentNode
    );

  if (direct) return direct;


  /*
   * แล้วค่อยค้นทั้ง JSON
   */
  const candidates = [];

  for (const block of blocks) {
    walk(block, (node, path) => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      const key =
        String(
          path[path.length - 1] ?? ""
        ).toLowerCase();

      const ownerLike = [
        "video_owner",
        "owner",
        "author",
        "actor",
        "profile_owner",
        "story_actor",
      ].includes(key);

      if (!ownerLike) return;

      const name =
        cleanText(
          node.name ||
          node.short_name ||
          node.username
        );

      if (!name) return;

      let score = 0;

      if (key === "video_owner")
        score += 100;

      if (
        key === "actor" ||
        key === "story_actor"
      )
        score += 90;

      if (key === "owner")
        score += 80;

      if (key === "author")
        score += 70;

      if (node.id)
        score += 20;

      if (
        node.url ||
        node.profile_url
      )
        score += 10;

      if (
        containsTarget(
          node,
          targetIds
        )
      )
        score += 80;

      candidates.push({
        score,
        name,
        id: node.id
          ? String(node.id)
          : "",
        url:
          makeAbsoluteUrl(
            node.url ||
            node.profile_url ||
            "",
            "https://www.facebook.com/"
          ),
      });
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score
  );

  return candidates[0] || null;
}


/* =========================================================
 * Post text
 * ========================================================= */

function findFirstText(
  value,
  keys
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return "";
  }

  for (const key of keys) {
    if (
      typeof value[key] === "string" &&
      cleanText(value[key])
    ) {
      return cleanPostText(
        value[key]
      );
    }
  }

  for (const key of keys) {
    const v =
      value[key];

    if (
      v &&
      typeof v === "object"
    ) {
      const text =
        v.text ||
        v.message ||
        v.body ||
        v.title?.text ||
        v.message?.text;

      if (
        typeof text === "string" &&
        cleanText(text)
      ) {
        return cleanPostText(
          text
        );
      }
    }
  }

  return "";
}

function extractPostText(
  blocks,
  contentNode,
  targetIds
) {
  const direct =
    findFirstText(
      contentNode,
      [
        "text",
        "message",
        "description",
        "title",
      ]
    );

  if (direct) return direct;

  /*
   * ค้นหา node ที่เกี่ยวข้องกับ video/post ID
   */
  for (const block of blocks) {
    let found = "";

    walk(block, node => {
      if (found) return;

      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      if (
        !containsTarget(
          node,
          targetIds
        )
      ) {
        return;
      }

      const text =
        findFirstText(
          node,
          [
            "text",
            "message",
            "description",
            "title",
          ]
        );

      if (
        text &&
        !/^(facebook video|facebook)$/i.test(text)
      ) {
        found = text;
      }
    });

    if (found) return found;
  }

  return "";
}


/* =========================================================
 * Number / reactions
 * ========================================================= */

function toNumber(value) {
  if (value == null)
    return null;

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const text =
    String(value)
      .trim()
      .toUpperCase()
      .replace(/,/g, "");

  if (!text) return null;

  const suffix =
    text.slice(-1);

  let multiplier = 1;

  if (suffix === "K")
    multiplier = 1000;

  if (suffix === "M")
    multiplier = 1000000;

  if (suffix === "B")
    multiplier = 1000000000;

  const numeric =
    Number(
      multiplier === 1
        ? text
        : text.slice(0, -1)
    );

  return Number.isFinite(numeric)
    ? numeric * multiplier
    : null;
}

function humanFormat(value) {
  const n =
    toNumber(value);

  if (n == null)
    return "null";

  if (n < 1000)
    return String(
      Math.round(n)
    );

  const units = [
    "",
    "K",
    "M",
    "B",
    "T",
  ];

  let x = n;
  let magnitude = 0;

  while (
    Math.abs(x) >= 1000 &&
    magnitude <
      units.length - 1
  ) {
    magnitude++;
    x /= 1000;
  }

  const rounded =
    Number(
      x.toPrecision(3)
    );

  return (
    `${rounded}${units[magnitude]}`
  );
}


/* =========================================================
 * Feedback
 * ========================================================= */

function getFeedbackCandidates(
  blocks,
  targetIds
) {
  const result = [];

  for (const block of blocks) {
    walk(block, node => {
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      const hasFeedbackShape =
        node.unified_reactors ||
        node.reaction_count ||
        node.total_comment_count != null ||
        node.share_count != null ||
        node.share_count_reduced != null ||
        node.top_reactions;

      if (!hasFeedbackShape)
        return;

      if (
        !containsTarget(
          node,
          targetIds
        )
      ) {
        return;
      }

      result.push(node);
    });
  }

  return result;
}

function extractReactionIds(
  feedback
) {
  if (
    !feedback ||
    typeof feedback !== "object"
  ) {
    return [];
  }

  const edges =
    feedback
      .top_reactions
      ?.edges;

  if (!Array.isArray(edges))
    return [];

  const ranked = [];

  for (
    let position = 0;
    position < edges.length;
    position++
  ) {
    const edge =
      edges[position];

    if (
      !edge ||
      typeof edge !== "object"
    ) {
      continue;
    }

    const node =
      edge.node;

    if (
      !node ||
      typeof node !== "object"
    ) {
      continue;
    }

    let id =
      node.id
        ? String(node.id)
        : "";

    if (
      !FACEBOOK_REACTION_EMOJIS[id]
    ) {
      const name =
        cleanText(
          node.localized_name ||
          node.name
        ).toLowerCase();

      id =
        FACEBOOK_REACTION_NAME_IDS[name] ||
        "";
    }

    if (!id) continue;

    const count =
      toNumber(
        edge.reaction_count
      ) ??
      toNumber(
        edge.i18n_reaction_count
      ) ??
      0;

    ranked.push({
      id,
      count,
      position,
    });
  }

  ranked.sort(
    (a, b) =>
      b.count - a.count ||
      a.position - b.position
  );

  const ids = [];

  for (const item of ranked) {
    if (!ids.includes(item.id)) {
      ids.push(item.id);
    }

    if (ids.length >= 2)
      break;
  }

  return ids.length === 2
    ? ids
    : [];
}

function extractFeedback(
  blocks,
  targetIds,
  contentNode
) {
  /*
   * Facebed ใช้ content_node.feedback ก่อน
   */
  const direct =
    contentNode?.feedback;

  if (
    direct &&
    typeof direct === "object"
  ) {
    return direct;
  }

  const candidates =
    getFeedbackCandidates(
      blocks,
      targetIds
    );

  if (!candidates.length)
    return null;

  const score =
    feedback => {
      let s = 0;

      if (
        feedback
          .unified_reactors
          ?.count != null
      ) {
        s += 20;
      }

      if (
        feedback
          .total_comment_count != null
      ) {
        s += 15;
      }

      if (
        feedback.share_count != null ||
        feedback.share_count_reduced != null
      ) {
        s += 15;
      }

      if (
        feedback.top_reactions
      ) {
        s += 10;
      }

      if (
        containsExactId(
          feedback,
          targetIds
        )
      ) {
        s += 50;
      }

      return s;
    };

  candidates.sort(
    (a, b) =>
      score(b) - score(a)
  );

  return candidates[0];
}


/* =========================================================
 * Date
 * ========================================================= */

function extractDate(
  blocks,
  targetIds,
  contentNode
) {
  const directValues = [
    contentNode?.creation_time,
    contentNode?.created_time,
  ];

  for (
    const value of directValues
  ) {
    const n =
      toNumber(value);

    if (
      n &&
      n > 1000000000
    ) {
      return Math.floor(n);
    }
  }

  for (const block of blocks) {
    let found = null;

    walk(block, node => {
      if (found) return;

      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node)
      ) {
        return;
      }

      if (
        !containsTarget(
          node,
          targetIds
        )
      ) {
        return;
      }

      for (
        const key of [
          "creation_time",
          "created_time",
          "creationTime",
          "createdTime",
        ]
      ) {
        const n =
          toNumber(node[key]);

        if (
          n &&
          n > 1000000000
        ) {
          found =
            Math.floor(n);

          return;
        }
      }
    });

    if (found)
      return found;
  }

  return null;
}

function formatTimestamp(ts) {
  if (!ts) return "";

  try {
    const date =
      new Date(
        Number(ts) * 1000
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    const pad =
      n =>
        String(n)
          .padStart(2, "0");

    /*
     * Facebed config timezone = 7
     */
    const shifted =
      new Date(
        date.getTime() +
        7 * 60 * 60 * 1000
      );

    return (
      `⌚ ${shifted.getUTCFullYear()}/` +
      `${pad(shifted.getUTCMonth() + 1)}/` +
      `${pad(shifted.getUTCDate())} ` +
      `${pad(shifted.getUTCHours())}:` +
      `${pad(shifted.getUTCMinutes())}:` +
      `${pad(shifted.getUTCSeconds())} UTC+07`
    );
  } catch {
    return "";
  }
}


/* =========================================================
 * Reaction string
 * ========================================================= */

function formatReactions(
  likes,
  comments,
  shares,
  reactionIds = []
) {
  const emojis = [];

  for (
    const id of reactionIds
  ) {
    const emoji =
      FACEBOOK_REACTION_EMOJIS[id];

    if (
      emoji &&
      !emojis.includes(emoji)
    ) {
      emojis.push(emoji);
    }
  }

  /*
   * Facebed fallback = ❤️
   */
  const prefix =
    emojis.length >= 2
      ? emojis
          .slice(0, 2)
          .join(" ")
      : "❤️";

  const parts = [];

  if (
    likes !== "null"
  ) {
    parts.push(
      `${prefix} ${likes}`
    );
  }

  if (
    comments !== "null"
  ) {
    parts.push(
      `💬 ${comments}`
    );
  }

  if (
    shares !== "null"
  ) {
    parts.push(
      `🔁 ${shares}`
    );
  }

  return parts
    .join(" • ")
    .replace(/,/g, ".");
}


/* =========================================================
 * Facebook fetch / resolver
 * ========================================================= */

async function fetchFacebook(url) {
  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers:
          FACEBOOK_HEADERS,
        redirect: "follow",
        cf: {
          cacheTtl: 0,
          cacheEverything: false,
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

async function resolveFacebookShare(
  url
) {
  const first =
    await fetchFacebook(url);

  if (
    isFacebookLoginUrl(
      first.finalUrl
    )
  ) {
    throw new Error(
      "Facebook returned a login/checkpoint page"
    );
  }

  const canonical =
    getCanonical(
      first.html
    );

  const ogUrl =
    getMeta(
      first.html,
      "og:url"
    );

  let resolvedUrl =
    canonical ||
    ogUrl ||
    first.finalUrl;

  if (
    !isFacebookUrl(
      resolvedUrl
    )
  ) {
    resolvedUrl =
      first.finalUrl;
  }

  /*
   * ถ้ายังเป็น share URL
   * ให้ fetch ซ้ำ
   */
  try {
    if (
      /\/share\/(?:r|v|p)\//i.test(
        new URL(
          resolvedUrl
        ).pathname
      ) &&
      resolvedUrl !==
        first.finalUrl
    ) {
      const second =
        await fetchFacebook(
          resolvedUrl
        );

      if (
        !isFacebookLoginUrl(
          second.finalUrl
        )
      ) {
        return {
          sourceUrl: url,
          resolvedUrl:
            second.finalUrl,
          html:
            second.html,
        };
      }
    }
  } catch {}

  return {
    sourceUrl: url,
    resolvedUrl,
    html: first.html,
  };
}


/* =========================================================
 * Inspect Facebook page
 * ========================================================= */

function inspectFacebookPage(
  html,
  resolvedUrl,
  targetIds = []
) {
  const blocks =
    getJsonBlocks(html);

  const contentNode =
    findContentNode(
      blocks,
      targetIds
    );

  const author =
    extractAuthor(
      blocks,
      targetIds,
      contentNode
    );

  const ogTitle =
    getMeta(
      html,
      "og:title"
    );

  const ogDescription =
    getMeta(
      html,
      "og:description"
    );

  const ogImage =
    getMeta(
      html,
      "og:image"
    );


  /*
   * Title
   */
  let title =
    ogTitle &&
    !/^(facebook video|facebook)$/i.test(
      ogTitle
    )
      ? ogTitle
      : getHtmlTitle(html);

  title =
    cleanText(title);

  title =
    title.replace(
      /\s*[-|]\s*Facebook$/i,
      ""
    ).trim();

  if (
    /^(facebook video|facebook)$/i.test(
      title
    )
  ) {
    title = "";
  }


  /*
   * Post text
   */
  let postText =
    ogDescription &&
    !/^(facebook video|facebook)$/i.test(
      ogDescription
    )
      ? cleanPostText(
          ogDescription
        )
      : "";

  if (!postText) {
    postText =
      extractPostText(
        blocks,
        contentNode,
        targetIds
      );
  }


  /*
   * Feedback
   */
  const feedback =
    extractFeedback(
      blocks,
      targetIds,
      contentNode
    );

  let likes = "null";
  let comments = "null";
  let shares = "null";

  if (feedback) {
    const likeValue =
      feedback
        .unified_reactors
        ?.count ??
      feedback
        .reaction_count
        ?.count ??
      feedback.reaction_count;

    const commentValue =
      feedback
        .total_comment_count ??
      feedback
        .cross_universe_feedback_info
        ?.ig_comment_count;

    const shareValue =
      feedback
        .share_count_reduced ??
      feedback.share_count;

    if (
      likeValue != null
    ) {
      likes =
        humanFormat(
          likeValue
        );
    }

    if (
      commentValue != null
    ) {
      comments =
        humanFormat(
          commentValue
        );
    }

    if (
      shareValue != null
    ) {
      shares =
        humanFormat(
          shareValue
        );
    }
  }


  /*
   * Date
   */
  const date =
    extractDate(
      blocks,
      targetIds,
      contentNode
    );


  /*
   * Top reactions
   */
  const reactionIds =
    extractReactionIds(
      feedback
    );


  /*
   * Video
   */
  const videoUrl =
    extractFacebookVideoUrl(
      html,
      targetIds
    );

  return {
    title,
    description:
      postText,
    image:
      makeAbsoluteUrl(
        ogImage
      ),
    videoUrl,

    authorName:
      author?.name || "",

    authorId:
      author?.id || "",

    authorUrl:
      author?.url || "",

    date,

    likes,
    comments,
    shares,

    reactionIds,

    resolvedUrl,
  };
}


/* =========================================================
 * Embed metadata
 * ========================================================= */

function buildVideoProxyUrl(
  sourceUrl
) {
  return (
    "/video?url=" +
    encodeURIComponent(
      sourceUrl
    )
  );
}

function buildSiteName(meta) {
  const lines = [];

  /*
   * Facebed style:
   *
   * faced by ...
   * ⌚ date
   * ❤️ likes • 💬 comments • 🔁 shares
   */

  lines.push(
    CREDIT
  );

  const date =
    formatTimestamp(
      meta.date
    );

  if (date) {
    lines.push(date);
  }

  const reactions =
    formatReactions(
      meta.likes,
      meta.comments,
      meta.shares,
      meta.reactionIds
    );

  if (reactions) {
    lines.push(
      reactions
    );
  }

  return lines.join("\n");
}


/* =========================================================
 * HTML / OG page
 * ========================================================= */

function htmlPage(
  meta,
  sourceUrl
) {
  const proxyUrl =
    meta.videoUrl
      ? new URL(
          buildVideoProxyUrl(
            sourceUrl
          ),
          "https://fb.c2z.top"
        ).href
      : "";

  /*
   * สำคัญ:
   *
   * og:title = ชื่อคนโพสต์
   *
   * ซึ่งเป็นแบบเดียวกับ Facebed
   */
  const author =
    meta.authorName ||
    "Facebook Video";

  const title =
    meta.title ||
    "";

  const description =
    meta.description ||
    "";

  const siteName =
    buildSiteName(
      meta
    );


  const safeAuthor =
    escapeAttr(author);

  const safeTitle =
    escapeAttr(title);

  const safeDescription =
    escapeAttr(
      description
    );

  const safeSiteName =
    escapeAttr(
      siteName
    );

  const safeSource =
    escapeAttr(
      sourceUrl
    );

  const safeResolved =
    escapeAttr(
      meta.resolvedUrl ||
      sourceUrl
    );

  const safeImage =
    escapeAttr(
      meta.image || ""
    );

  const safeVideo =
    escapeAttr(
      proxyUrl
    );


  return `<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<title>
${escapeHtml(
  author +
  (title && title !== author
    ? " — " + title
    : "")
)}
</title>


<!-- =====================================================
     Open Graph
     ===================================================== -->

<meta property="og:type"
      content="video.other">

<!-- Facebed: author_name -->
<meta property="og:title"
      content="${safeAuthor}">

<!-- Facebed: post.text -->
<meta property="og:description"
      content="${safeDescription}">

<!-- Facebed: credit + date + reactions -->
<meta property="og:site_name"
      content="${safeSiteName}">

<meta property="og:url"
      content="${safeResolved}">


${
  safeImage
    ? `
<meta property="og:image"
      content="${safeImage}">
`
    : ""
}


${
  safeVideo
    ? `
<meta property="og:video"
      content="${safeVideo}">

<meta property="og:video:secure_url"
      content="${safeVideo}">

<meta property="og:video:type"
      content="video/mp4">

<meta property="og:video:width"
      content="1280">

<meta property="og:video:height"
      content="720">

<meta property="twitter:player:stream"
      content="${safeVideo}">

<meta property="twitter:player:stream:content_type"
      content="video/mp4">
`
    : ""
}


<!-- =====================================================
     Twitter
     ===================================================== -->

<meta name="twitter:card"
      content="player">

<meta name="twitter:title"
      content="${safeAuthor}">

<meta name="twitter:description"
      content="${safeDescription}">


${
  safeImage
    ? `
<meta name="twitter:image"
      content="${safeImage}">
`
    : ""
}


<meta name="theme-color"
      content="#0866ff">

<link rel="canonical"
      href="${safeResolved}">

</head>


<body style="
  font-family:system-ui,sans-serif;
  background:#111;
  color:#eee;
  padding:24px;
">

<main style="
  max-width:900px;
  margin:auto;
">


<div style="
  font-size:14px;
  color:#aaa;
  margin-bottom:8px;
">
  ${escapeHtml(CREDIT)}
</div>


<h1 style="
  margin:0 0 8px;
">
  ${safeAuthor}
</h1>


${
  title &&
  title !== author
    ? `
<h2 style="
  font-weight:500;
  margin:0 0 16px;
">
  ${safeTitle}
</h2>
`
    : ""
}


${
  description
    ? `
<p style="
  white-space:pre-wrap;
  color:#ccc;
">
  ${escapeHtml(
    description
  )}
</p>
`
    : ""
}


${
  safeVideo
    ? `
<video
  controls
  playsinline
  preload="metadata"
  ${
    safeImage
      ? `poster="${safeImage}"`
      : ""
  }
  style="
    max-width:100%;
    width:900px;
  "
>
  <source
    src="${safeVideo}"
    type="video/mp4"
  >
</video>
`
    : safeImage
      ? `
<img
  src="${safeImage}"
  alt=""
  style="max-width:100%"
>
`
      : ""
}


<p style="
  margin-top:18px;
">
  <a
    href="${safeSource}"
    rel="noopener noreferrer"
    style="color:#4da3ff"
  >
    Open on Facebook
  </a>
</p>


</main>

</body>
</html>`;
}


/* =========================================================
 * Error
 * ========================================================= */

function errorResponse(
  message,
  status = 502
) {
  const html =
`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<title>Facebook Embed Error</title>

<meta property="og:title"
      content="Facebook Embed Error">

<meta property="og:description"
      content="${escapeAttr(
        message
      )}">

</head>

<body>

<h1>
Facebook Embed Error
</h1>

<p>
${escapeHtml(
  message
)}
</p>

</body>
</html>`;

  return new Response(
    html,
    {
      status,
      headers: {
        "content-type":
          "text/html; charset=UTF-8",

        "cache-control":
          "no-store",
      },
    }
  );
}


/* =========================================================
 * Routes
 * ========================================================= */

function isSharePath(
  pathname
) {
  return /^\/share(?:\/|$)/i.test(
    pathname
  );
}

function isSupportedFacebookPath(
  pathname
) {
  const path =
    pathname.toLowerCase();

  if (
    /^\/(?:reel|reels)\/[^/]+/i.test(
      path
    )
  ) {
    return true;
  }

  if (
    /^\/watch$/i.test(path)
  ) {
    return true;
  }

  if (
    /^\/permalink\.php$/i.test(
      path
    )
  ) {
    return true;
  }

  if (
    /^\/story\.php$/i.test(
      path
    )
  ) {
    return true;
  }

  if (
    /^\/photo(?:\.php)?$/i.test(
      path
    )
  ) {
    return true;
  }

  if (
    /^\/groups\/[^/]+\/(?:posts|permalink)\//i.test(
      path
    )
  ) {
    return true;
  }

  if (
    /^\/[^/]+\/(?:posts|videos)\//i.test(
      path
    )
  ) {
    return true;
  }

  return isSharePath(
    pathname
  );
}


/* =========================================================
 * Full Facebook URL in pathname
 *
 * /https://www.facebook.com/...
 * ========================================================= */

function extractFacebookUrlFromPath(
  pathname
) {
  const decoded =
    decodeURIComponent(
      pathname.replace(
        /^\/+/,
        ""
      )
    );

  if (
    isFacebookUrl(
      decoded
    )
  ) {
    return decoded;
  }

  if (
    /^(?:www\.)?facebook\.com\//i.test(
      decoded
    )
  ) {
    return (
      "https://" +
      decoded
    );
  }

  return "";
}


/* =========================================================
 * Get complete metadata
 * ========================================================= */

async function getMetaForSource(
  sourceUrl
) {
  let resolved =
    await resolveFacebookShare(
      sourceUrl
    );

  let targetIds =
    getTargetIds(
      resolved.resolvedUrl
    );

  let meta =
    inspectFacebookPage(
      resolved.html || "",
      resolved.resolvedUrl,
      targetIds
    );


  /*
   * Share HEAD / Facebook redirect
   * บางครั้ง HTML แรกไม่มีข้อมูลครบ
   *
   * ดังนั้นโหลด final post อีกครั้ง
   */
  if (
    !resolved.html ||
    !meta.authorName ||
    !meta.videoUrl ||
    !meta.date ||
    !meta.likes
  ) {
    const page =
      await fetchFacebook(
        resolved.resolvedUrl
      );

    if (
      !isFacebookLoginUrl(
        page.finalUrl
      )
    ) {
      resolved = {
        ...resolved,
        resolvedUrl:
          page.finalUrl ||
          resolved.resolvedUrl,
        html:
          page.html,
      };

      targetIds = [
        ...new Set([
          ...targetIds,
          ...getTargetIds(
            resolved.resolvedUrl
          ),
        ]),
      ];

      const enriched =
        inspectFacebookPage(
          resolved.html,
          resolved.resolvedUrl,
          targetIds
        );

      /*
       * เติมเฉพาะค่าที่หาได้
       */
      for (
        const [key, value]
        of Object.entries(enriched)
      ) {
        if (
          typeof value === "string"
        ) {
          if (value !== "") {
            meta[key] =
              value;
          }
        } else if (
          Array.isArray(value)
        ) {
          if (value.length) {
            meta[key] =
              value;
          }
        } else if (
          value != null
        ) {
          meta[key] =
            value;
        }
      }
    }
  }


  /*
   * Final video extraction
   */
  if (
    !meta.videoUrl
  ) {
    meta.videoUrl =
      extractFacebookVideoUrl(
        resolved.html || "",
        targetIds
      );
  }

  meta.resolvedUrl =
    resolved.resolvedUrl;

  return {
    meta,
    resolved,
  };
}


/* =========================================================
 * Worker
 * ========================================================= */

export default {
  async fetch(request) {
    const requestUrl =
      new URL(
        request.url
      );

    const pathname =
      requestUrl.pathname;

    try {

      /* ===================================================
       * Home
       * =================================================== */

      if (
        pathname === "/" ||
        pathname === ""
      ) {
        return new Response(
`<!DOCTYPE html>
<html>

<head>
<meta charset="UTF-8">
<title>faced by C2Z</title>
</head>

<body style="
font-family:system-ui;
padding:40px;
">

<h1>
faced by C2Z
</h1>

<p>
Facebook embed proxy is running.
</p>

<p>
Use a Facebook URL or Facebed-style route.
</p>

</body>
</html>`,
          {
            headers: {
              "content-type":
                "text/html; charset=UTF-8",

              "cache-control":
                "public, max-age=300",
            },
          }
        );
      }


      /* ===================================================
       * Direct video endpoint
       *
       * /video?url=https://www.facebook.com/...
       * =================================================== */

      if (
        pathname === "/video"
      ) {
        const sourceUrl =
          requestUrl.searchParams.get(
            "url"
          );

        if (
          !sourceUrl ||
          !isFacebookUrl(
            sourceUrl
          )
        ) {
          return errorResponse(
            "Missing or invalid Facebook URL",
            400
          );
        }

        const {
          meta,
        } =
          await getMetaForSource(
            sourceUrl
          );

        if (
          !meta.videoUrl
        ) {
          return errorResponse(
            "Could not find a Facebook video URL",
            404
          );
        }

        /*
         * Discord / browser จะได้ 302
         * ไปยัง Facebook CDN MP4
         */
        return Response.redirect(
          meta.videoUrl,
          302
        );
      }


      /* ===================================================
       * /?url=https://facebook.com/...
       * =================================================== */

      let sourceUrl =
        requestUrl.searchParams.get(
          "url"
        );

      if (
        sourceUrl &&
        isFacebookUrl(
          sourceUrl
        )
      ) {
        const result =
          await getMetaForSource(
            sourceUrl
          );

        return new Response(
          htmlPage(
            result.meta,
            sourceUrl
          ),
          {
            status: 200,

            headers: {
              "content-type":
                "text/html; charset=UTF-8",

              "cache-control":
                "public, max-age=300",
            },
          }
        );
      }


      /* ===================================================
       * Full Facebook URL in pathname
       *
       * /https://www.facebook.com/reel/...
       * =================================================== */

      const fullFacebookUrl =
        extractFacebookUrlFromPath(
          pathname
        );

      if (
        fullFacebookUrl
      ) {
        const result =
          await getMetaForSource(
            fullFacebookUrl
          );

        return new Response(
          htmlPage(
            result.meta,
            fullFacebookUrl
          ),
          {
            status: 200,

            headers: {
              "content-type":
                "text/html; charset=UTF-8",

              "cache-control":
                "public, max-age=300",
            },
          }
        );
      }


      /* ===================================================
       * Facebed-style routes
       *
       * /share/r/...
       * /share/v/...
       * /share/...
       * /reel/...
       * /reels/...
       * /user/videos/...
       * /user/posts/...
       * /groups/.../posts/...
       * /groups/.../permalink/...
       * /watch?v=...
       * /permalink.php?...
       * /story.php?...
       * /photo?...
       * =================================================== */

      if (
        isSupportedFacebookPath(
          pathname
        )
      ) {
        const facebookSource =
          `https://www.facebook.com${pathname}${requestUrl.search}`;

        const result =
          await getMetaForSource(
            facebookSource
          );

        return new Response(
          htmlPage(
            result.meta,
            facebookSource
          ),
          {
            status: 200,

            headers: {
              "content-type":
                "text/html; charset=UTF-8",

              "cache-control":
                "public, max-age=300",
            },
          }
        );
      }


      /* ===================================================
       * Unsupported
       * =================================================== */

      return errorResponse(
        "Unsupported route",
        404
      );

    } catch (error) {

      console.error(
        error
      );

      return errorResponse(
        error instanceof Error
          ? error.message
          : "Unknown error",
        502
      );
    }
  },
};