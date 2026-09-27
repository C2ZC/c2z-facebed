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

${
  error
    ? `
<div class="error">
${escapeHtml(error)}
</div>
`
    : ""
}

</div>

${
  inputUrl && !error
    ? `

<div class="card">

<div class="preview">

${
  image
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

${
  authorName
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

${
  description
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