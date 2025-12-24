export default async function handler(req, res) {
  try {
    const { url, videoId } = req.query;
    const id = videoId || extractVideoId(url);

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid YouTube URL / videoId",
        developer: "@lakshitpatidar"
      });
    }

    /* ---------- FETCH CAPTION LIST ---------- */
    const listRes = await fetch(
      "https://video.google.com/timedtext?type=list&v=" + id
    );

    if (!listRes.ok) {
      return noTranscript(res, id);
    }

    const listText = await listRes.text();
    const langMatch = listText.match(/lang_code="([^"]+)"/);

    if (!langMatch) {
      return noTranscript(res, id);
    }

    const lang = langMatch[1];

    /* ---------- FETCH TRANSCRIPT ---------- */
    const tRes = await fetch(
      "https://video.google.com/timedtext?v=" + id + "&lang=" + lang
    );

    if (!tRes.ok) {
      return noTranscript(res, id);
    }

    const xml = await tRes.text();
    const segments = parseSegments(xml);

    if (!segments.length) {
      return noTranscript(res, id);
    }

    const fullText = segments.map(s => s.text).join(" ");
    const wordCount = countWords(fullText);

    /* ---------- REAL DETAILED SUMMARY (SAFE) ---------- */
    const summary = generateRealSummary(fullText);

    return res.status(200).json({
      success: true,
      videoId: id,

      transcript: {
        available: true,
        language: lang,
        stats: {
          words: wordCount,
          segments: segments.length,
          estimated_speaking_minutes: Math.ceil(wordCount / 150)
        },
        text: {
          full: fullText,
          paragraphs: buildParagraphs(segments)
        },
        segments
      },

      summary: {
        style: "real_extractive_narrative",
        detail_level: "high",
        content: summary
      },

      developer: "@lakshitpatidar"
    });

  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "Runtime safe error handled",
      developer: "@lakshitpatidar"
    });
  }
}

/* ================= HELPERS ================= */

function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/(youtu\.be\/|v=|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[2] : null;
}

function parseSegments(xml) {
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  const segments = [];
  let m;

  while ((m = regex.exec(xml)) !== null) {
    const clean = decodeXML(m[1]);
    if (clean.length > 2) segments.push({ text: clean });
  }
  return segments;
}

function decodeXML(t) {
  return t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function buildParagraphs(segments) {
  const out = [];
  let buf = "";

  for (let i = 0; i < segments.length; i++) {
    buf += segments[i].text + " ";
    if ((i + 1) % 5 === 0) {
      out.push(buf.trim());
      buf = "";
    }
  }

  if (buf.trim()) out.push(buf.trim());
  return out;
}

function countWords(text) {
  return text.trim().split(/\s+/).length;
}

/* ---------- SAFE SUMMARY (NO LOOKBEHIND) ---------- */
function generateRealSummary(text) {
  const sentences = text.split(". ").filter(s => s.length > 40);

  if (sentences.length < 6) {
    return sentences.join(". ");
  }

  const intro = sentences.slice(0, 3);
  const middle = [];
  for (let i = 3; i < sentences.length; i += 5) {
    middle.push(sentences[i]);
  }
  const end = sentences.slice(-3);

  const combined = [...intro, ...middle, ...end];
  return [...new Set(combined)].join(". ") + ".";
}

function noTranscript(res, id) {
  return res.status(200).json({
    success: true,
    videoId: id,
    transcript: { available: false },
    developer: "@lakshitpatidar"
  });
}
