#!/usr/bin/env node
// A tiny stand-in for the Anthropic Messages API, for local end-to-end tests
// without an API key. It answers POST /v1/messages (streaming or not), and for
// structured-output requests it fills the requested JSON schema with
// biology-flavored sample data.
//
//   node scripts/mock-anthropic.mjs            # listens on 127.0.0.1:4010
//   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test npm run dev
//
// MOCK_DELAY_MS slows streaming (default 15 ms per chunk).
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const DELAY = Number(process.env.MOCK_DELAY_MS || 15);

const TOPICS = [
  { title: "Glycolysis", summary: "Ten steps that split glucose into two pyruvate and net 2 ATP + 2 NADH." },
  { title: "Pyruvate oxidation and the citric acid cycle", summary: "Acetyl-CoA enters the cycle; NADH and FADH2 carry electrons onward." },
  { title: "Electron transport and chemiosmosis", summary: "Complexes I-IV pump protons; ATP synthase uses the gradient." },
  { title: "Regulation of metabolism", summary: "PFK-1, allosteric control, hormones and the fed/fasted switch." },
];

const CARDS = [
  ["Phosphofructokinase-1 (PFK-1)", "Rate-limiting enzyme of glycolysis; converts fructose-6-phosphate to fructose-1,6-bisphosphate. Activated by AMP and fructose-2,6-bisphosphate, inhibited by ATP and citrate."],
  ["Hexokinase", "Phosphorylates glucose to glucose-6-phosphate in most tissues; low Km, inhibited by its product."],
  ["Substrate-level phosphorylation", "Making ATP by transferring a phosphate directly from a substrate to ADP, as in pyruvate kinase."],
  ["Pyruvate dehydrogenase complex", "Converts pyruvate to acetyl-CoA in the mitochondrial matrix; needs thiamine (B1), lipoate, CoA, FAD, NAD+."],
  ["Citrate synthase", "Joins acetyl-CoA and oxaloacetate to form citrate, the first step of the citric acid cycle."],
  ["ATP synthase (Complex V)", "Uses the proton-motive force to phosphorylate ADP; protons flow through F0 and turn the F1 head."],
  ["Chemiosmosis", "Coupling of the proton gradient across the inner mitochondrial membrane to ATP synthesis."],
  ["Cytochrome c", "Small mobile carrier that moves electrons from Complex III to Complex IV in the intermembrane space."],
  ["Uncoupler", "A molecule (e.g. 2,4-DNP, thermogenin) that lets protons leak back, so oxygen is used but less ATP is made and heat is released."],
  ["Fructose-2,6-bisphosphate", "Allosteric activator of PFK-1 made by PFK-2; insulin raises it, glucagon lowers it in the liver."],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const id = (p) => `${p}_mock${Date.now().toString(36)}${(counter++).toString(36)}`;

function sectionMarkdown(title) {
  return `## ${title}

**Big picture:** ${title.toLowerCase()} is how the cell turns fuel into usable energy in steps it can control.

### Key steps
1. **Investment:** ATP is spent to trap and prime the substrate.
2. **Payoff:** high-energy intermediates hand their phosphate to ADP.
3. **Hand-off:** electrons leave on NADH for the electron transport chain.

| Feature | Glycolysis | Citric acid cycle |
|---|---|---|
| Location | Cytosol | Mitochondrial matrix |
| Needs O2 directly | No | No (but stops without it) |
| Net ATP/GTP | 2 | 2 per glucose |

> **High-yield:** PFK-1 is the main control point. AMP and fructose-2,6-bisphosphate turn it on; ATP and citrate turn it off.

**Mnemonic:** "Goodness Gracious, Father Franklin..." for the order of glycolytic intermediates.

### Check yourself
- Why does a cell with lots of ATP slow glycolysis?
- Where is NADH made in this pathway?
- What happens to pyruvate without oxygen?`;
}

// Build sample data that satisfies a JSON schema, with smart values for known keys.
function fake(schema, key = "", ctx = {}) {
  if (!schema || typeof schema !== "object") return null;
  if (schema.anyOf) return fake(schema.anyOf.find((s) => s.type !== "null") || schema.anyOf[0], key, ctx);
  if (schema.oneOf) return fake(schema.oneOf[0], key, ctx);
  if (schema.enum) return schema.enum.includes("medium") ? "medium" : schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;

  if (type === "object" || schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties || {})) out[k] = fake(v, k, ctx);
    return out;
  }
  if (type === "array") {
    const lower = key.toLowerCase();
    let n = lower.includes("topic") ? TOPICS.length
      : lower.includes("card") ? 8
      : lower.includes("question") ? 5
      : lower.includes("choice") || lower.includes("option") ? 4
      : 3;
    if (schema.minItems) n = Math.max(n, schema.minItems);
    if (schema.maxItems) n = Math.min(n, schema.maxItems);
    return Array.from({ length: n }, (_, i) => fake(schema.items, key, { ...ctx, index: i, parentKey: key }));
  }
  if (type === "integer" || type === "number") {
    if (/answer/i.test(key)) return (ctx.index ?? 0) % 4;
    let v = schema.minimum ?? 0;
    if (schema.maximum !== undefined) v = Math.min(Math.max(v, 1), schema.maximum);
    return type === "integer" ? Math.round(v) : v;
  }
  if (type === "boolean") return false;

  // strings
  const i = ctx.index ?? 0;
  const k = key.toLowerCase();
  const parent = (ctx.parentKey || "").toLowerCase();
  if (k === "id" || k === "topic_id") return `t${(i % TOPICS.length) + 1}`;
  if (k === "title" || k === "topic_title") return TOPICS[i % TOPICS.length].title;
  if (k === "summary") return TOPICS[i % TOPICS.length].summary;
  if (k === "content_md" || k === "markdown") return sectionMarkdown(ctx.sectionTitle || "Glycolysis");
  if (k === "term" || k === "front") return CARDS[i % CARDS.length][0];
  if (k === "definition" || k === "back") return CARDS[i % CARDS.length][1];
  if (k === "hint") return "Think about where the cell spends versus earns ATP.";
  if (k === "stem" || k === "question") {
    return `A 24-year-old runner's muscle cells are treated with a drug that blocks Complex IV. Which change is expected first? (Q${i + 1})`;
  }
  if (parent.includes("choice") || parent.includes("option")) {
    return ["NADH builds up in the matrix", "ATP synthase runs faster", "Oxygen use rises", "The proton gradient grows"][i % 4];
  }
  if (k === "explanation") return "Blocking Complex IV stops electron flow, so NADH can't be reoxidized and builds up. ATP synthase slows because the gradient collapses; oxygen use falls.";
  if (k === "query") return `${TOPICS[i % TOPICS.length].title} animation explained`;
  if (k === "reason") return "Look for an animation that follows one molecule through each step.";
  if (k === "difficulty") return "medium";
  if (k.includes("text") || k.includes("transcript")) return "Mock transcription of the uploaded page. [Figure: diagram of the mitochondrion]";
  return `Sample ${key || "text"}`;
}

function pickSchema(body) {
  const fmt = body.output_config?.format || body.output_format;
  if (fmt?.schema) return fmt.schema;
  // strict tool used for structured output
  if (Array.isArray(body.tools) && body.tools.length === 1 && body.tools[0].input_schema) return null;
  return null;
}

function lastUserText(body) {
  const msgs = body.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    const t = (m.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (t) return t;
  }
  return "";
}

function sectionTitleFrom(body) {
  const text = lastUserText(body);
  const m = text.match(/(?:topic|section)[^"\n]*"([^"]+)"/i) || text.match(/Title:\s*(.+)/i);
  return m ? m[1].trim() : undefined;
}

function buildReply(body) {
  const schema = pickSchema(body);
  const question = lastUserText(body);
  if (process.env.MOCK_REFUSE && question.includes(process.env.MOCK_REFUSE)) {
    return { refusal: true, text: "" };
  }
  if (schema) {
    return { text: JSON.stringify(fake(schema, "", { sectionTitle: sectionTitleFrom(body) })) };
  }
  if (/transcrib/i.test(question)) {
    return { text: "Lecture 4: Cellular respiration\n\nGlycolysis happens in the cytosol. [Figure: the ten steps of glycolysis]" };
  }
  return {
    text: `Here's the short version, based on your notes.\n\n**${question.slice(0, 80) || "Your question"}**\n\n- Glycolysis makes a little ATP fast, in the cytosol.\n- The citric acid cycle loads NADH and FADH2.\n- The electron transport chain turns those electrons into a proton gradient, and **ATP synthase** cashes it in.\n\n| Stage | ATP per glucose |\n|---|---|\n| Glycolysis | 2 |\n| Citric acid cycle | 2 |\n| Oxidative phosphorylation | ~26-28 |\n\n**Quick check:** why does cyanide stop ATP production even though glycolysis still works?`,
  };
}

function usage(text) {
  return { input_tokens: 1200, output_tokens: Math.max(1, Math.round(text.length / 4)), cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}

async function handle(req, res) {
  if (req.method === "GET" && req.url.startsWith("/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "mock: not found" } }));
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "bad json" } }));
  }
  if (req.url.startsWith("/v1/messages/count_tokens")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ input_tokens: 1200 }));
  }

  const reply = buildReply(body);
  const model = body.model || "claude-opus-5-5";
  const msgId = id("msg");
  const stopReason = reply.refusal ? "refusal" : "end_turn";
  const content = reply.refusal ? [] : [{ type: "text", text: reply.text }];
  const stopDetails = reply.refusal ? { type: "refusal", category: "bio", explanation: "mock refusal" } : null;
  console.log(`[mock] ${body.stream ? "stream" : "json"} ${model} schema=${pickSchema(body) ? "yes" : "no"} -> ${reply.text.length} chars${reply.refusal ? " (refusal)" : ""}`);

  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json", "request-id": id("req") });
    return res.end(JSON.stringify({
      id: msgId, type: "message", role: "assistant", model, content,
      stop_reason: stopReason, stop_sequence: null, stop_details: stopDetails, usage: usage(reply.text),
    }));
  }

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "request-id": id("req") });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
  send("message_start", { message: { id: msgId, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } } });
  if (!reply.refusal) {
    send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    const parts = reply.text.match(/[\s\S]{1,24}/g) || [];
    for (const part of parts) {
      send("content_block_delta", { index: 0, delta: { type: "text_delta", text: part } });
      if (DELAY) await sleep(DELAY);
    }
    send("content_block_stop", { index: 0 });
  }
  send("message_delta", { delta: { stop_reason: stopReason, stop_sequence: null, stop_details: stopDetails }, usage: { output_tokens: usage(reply.text).output_tokens } });
  send("message_stop", {});
  res.end();
}

http
  .createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: String(err) } }));
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock Anthropic API on http://127.0.0.1:${PORT}`));
