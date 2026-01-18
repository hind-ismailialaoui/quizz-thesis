const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { parse } = require("csv-parse/sync");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const CSV_PATH =
  process.env.KB_CSV_PATH ||
  path.join(__dirname, "LSAT_Questions_With_Answer_Explanation.csv");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

let knowledgeBase = [];

function loadKnowledgeBase() {
  const csv = fs.readFileSync(CSV_PATH, "utf8");
  knowledgeBase = parse(csv, {
    columns: true,
    skip_empty_lines: true,
  });
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function buildRowText(row) {
  return [
    row["Question"],
    row["Good Answer"],
    row["False Answer 1"],
    row["False Answer 2"],
    row["False Answer 3"],
    row["Answer Explanation"],
  ]
    .filter(Boolean)
    .join(" ");
}

function findRelevantRows(query) {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];

  const scored = knowledgeBase
    .map((row) => {
      const rowText = buildRowText(row);
      const rowTokens = new Set(tokenize(rowText));
      let score = 0;
      for (const token of queryTokens) {
        if (rowTokens.has(token)) score += 1;
      }
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map((item) => item.row);
}

function buildContext(rows) {
  if (rows.length === 0) return "";
  return rows
    .map((row, index) => {
      const falseAnswers = [
        row["False Answer 1"],
        row["False Answer 2"],
        row["False Answer 3"],
      ]
        .filter(Boolean)
        .join(" | ");

      return [
        `Item ${index + 1}:`,
        `Question: ${row["Question"]}`,
        `Good Answer: ${row["Good Answer"]}`,
        `False Answers: ${falseAnswers}`,
        `Explanation: ${row["Answer Explanation"]}`,
      ].join("\n");
    })
    .join("\n\n");
}

async function callOpenAI({ message, context }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }
  
  // C'est ici que on change le prompt pour les questions LSAT
  const systemPrompt = [
    "You are a helpful, natural-sounding assistant.",
    "If the user asks about LSAT or quiz content, use the provided context.",
    "Keep answers short and natural: 2-4 sentences, no bullet lists.",
    "If the context does not contain the answer, respond briefly and say so.",
  ].join(" ");

  const userPrompt = context
    ? `Context:\n${context}\n\nUser question:\n${message}`
    : `User question:\n${message}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 220,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("No reply from OpenAI.");
  return reply;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "Missing message." });
  }

  try {
    const matches = findRelevantRows(message);
    const context = buildContext(matches);
    const reply = await callOpenAI({ message, context });
    return res.json({ reply });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Server error." });
  }
});

loadKnowledgeBase();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
