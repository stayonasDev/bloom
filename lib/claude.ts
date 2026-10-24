// Claude 호출 4개 (API.md "Claude 호출 4개"). 출력은 JSON만 받고 zod로 검증, 실패 시 1회 재시도 후 CLAUDE_FAILED.
// 가격 산정은 여기서 하지 않는다 (서버 상수, lib/pricing.ts).
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ApiError } from "./errors";
import type { HandoverNote, Language, NoteItem, RunKind } from "./server-types";
import { languageName } from "./lang";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");
  client = new Anthropic();
  return client;
}

/** claude_runs에 들어갈 실측 */
export type RunMeta = {
  kind: RunKind;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
};

// ---------- zod 스키마 (API.md 출력 열) ----------

const followupSchema = z.object({
  followup_questions: z
    .array(z.object({
      id: z.string(),
      question: z.string().min(10),
      target: z.enum(["rare", "detail"]),
    }))
    .min(2)
    .max(3),
});

const noteItem = z.object({
  id: z.string(),
  text: z.string().min(1),
  kind: z.enum(["rare", "manual"]),
  source: z.string(),
});

const extractSchema = z.object({
  handover_note: z.object({
    rules: z.array(noteItem),
    exceptions: z.array(noteItem),
    judgment_calls: z.array(noteItem),
    common_mistakes: z.array(noteItem),
    never_do: z.array(noteItem),
  }),
  generalization_log: z.array(z.object({
    type: z.enum(["company", "system", "customer", "person", "location"]),
    replaced_with: z.string(),
    count: z.number().int().min(1),
  })),
  card: z.object({
    field: z.string().min(2),
    difficulty: z.number().int().min(1).max(5),
    rarity: z.number().int().min(1).max(5),
    one_liner: z.string().min(5),
  }),
});

// rank·개수는 서버가 다시 매기므로 스키마는 느슨하게 (모델이 4개를 주면 잘라낸다)
const matchSchema = z.object({
  matches: z.array(z.object({
    card_id: z.string(),
    rank: z.number().int().min(1),
    score: z.number().min(0).max(1),
    reason: z.string().min(1),
  })),
});

const sealedQaSchema = z.object({
  answer: z.string(),
  evidence_item_ids: z.array(z.string()),
  covered: z.boolean(),
});

// ---------- 공통 호출 ----------

const jsonOnly = (schemaText: string) =>
  `\n\nOutput JSON only — no prose, no markdown fences. Exact shape:\n${schemaText}`;

function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in response");
  return JSON.parse(stripped.slice(start, end + 1));
}

async function callJson<T>(
  kind: RunKind,
  system: string,
  user: string,
  schema: z.ZodType<T>,
  maxTokens: number,
): Promise<{ output: T; run: RunMeta }> {
  const run: RunMeta = { kind, model: MODEL, input_tokens: 0, output_tokens: 0, duration_ms: 0 };
  let lastIssue = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
    if (attempt > 0) {
      messages.push(
        { role: "assistant", content: "{" },
      );
      messages[0] = {
        role: "user",
        content: `${user}\n\nYour previous output failed validation: ${lastIssue}\nReturn only valid JSON matching the shape exactly.`,
      };
      messages.pop();
    }

    const t0 = Date.now();
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });
    run.duration_ms += Date.now() - t0;
    run.input_tokens = (run.input_tokens ?? 0) + (res.usage?.input_tokens ?? 0);
    run.output_tokens = (run.output_tokens ?? 0) + (res.usage?.output_tokens ?? 0);

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return { output: parsed.data, run };
      lastIssue = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastIssue = e instanceof Error ? e.message : String(e);
    }
  }
  throw new ApiError("CLAUDE_FAILED", `Claude output failed validation (${kind}): ${lastIssue}`);
}

// ---------- ① followup ----------

export type FollowupInput = {
  role_title: string;
  years_experience: number;
  language: Language;
  seed_answers: { q1: string; q2: string; q3: string; q4: string };
  notes?: string | null;
};

const SEED_LABELS = {
  q1: "What the manual never said",
  q2: "What new hires always get wrong",
  q3: "A request you refused, and why",
  q4: "A case the script couldn't solve",
} as const;

export async function generateFollowups(input: FollowupInput) {
  const lang = languageName(input.language);
  const system =
    `You are interviewing a frontline worker to extract the judgment they built on the job — not what the manual says.
Role: ${input.role_title}, ${input.years_experience} years of experience.

Separate two things in their answers:
- manual knowledge: anything a handbook, script or training deck would state;
- rare judgment: decisions made where the script ran out — exceptions, refusals, thresholds, timing, workarounds, numbers.

Find where the rare judgment is thin: a decision with no number, a situation with no trigger, a refusal with no stated reason, a workaround with no condition. Ask 2–3 follow-up questions that target exactly those gaps. Each question must reference something specific they said. Never ask for company names, customer names or logs.
target = "rare" when the question digs into a judgment call; "detail" when it asks for exact numbers, dates, amounts or counts.
Write the questions in ${lang}. ids: "f1", "f2", "f3".` +
    jsonOnly(`{"followup_questions":[{"id":"f1","question":"...","target":"rare"|"detail"}]}`);

  const user = [
    ...(["q1", "q2", "q3", "q4"] as const).map((k) => `## ${k} — ${SEED_LABELS[k]}\n${input.seed_answers[k]}`),
    input.notes ? `## notes — their own notes/checklists\n${input.notes}` : "",
  ].filter(Boolean).join("\n\n");

  const { output, run } = await callJson("followup", system, user, followupSchema, 1024);
  // id를 f1..fn으로 정규화 (응답 id가 중복·누락되어도 답변 매핑이 깨지지 않게)
  const followup_questions = output.followup_questions.map((q, i) => ({ ...q, id: `f${i + 1}` }));
  return { followup_questions, run };
}

// ---------- ② extract ----------

export type ExtractInput = FollowupInput & {
  followup_questions: { id: string; question: string }[];
  followup_answers: Record<string, string>;
};

const ID_PREFIX: Record<keyof HandoverNote, string> = {
  rules: "r", exceptions: "e", judgment_calls: "j", common_mistakes: "m", never_do: "n",
};

export async function extractNote(input: ExtractInput) {
  const system =
    `You turn an interview with a frontline worker into a sealed Handover Note. Write every item text, the card field and the one_liner in ${languageName(input.language)} — the language the worker used; keep JSON keys and the kind/source values exactly as specified. The note is sold to companies that need this person's judgment for cases their support AI cannot resolve.
Role: ${input.role_title}, ${input.years_experience} years.

Structure the note into five lists: rules, exceptions, judgment_calls, common_mistakes, never_do.
Each item is one concrete, actionable sentence of at most 30 words that keeps every number, threshold, day count, amount and condition the worker gave — those are the value. No generic advice, no padding, no restating the same point in two sections. Aim for 15–25 items in total, only what the interview supports.
item.kind = "rare" if it is judgment beyond the manual (an exception, a threshold they learned, a refusal, timing, a workaround); "manual" if a handbook would state it.
item.source = the answer it came from: "q1".."q4", "f1".."f3", or "notes".
item.id: leave as "x"; the server assigns ids.

Generalize every proper noun. Company names → "the carrier" / "the company"; internal tools and systems → "the billing system", "the CRM"; customer or colleague names → "the customer", "a colleague"; places → "the region". Record each distinct replacement once in generalization_log with type (company|system|customer|person|location), replaced_with, and how many times it was applied. Never keep a real company, product, system, person or place name anywhere in the note or card.

Card (public, the buyer sees only this):
- field: 3–6 words naming the domain, e.g. "Telecom billing disputes"
- difficulty: 1–5, how hard the cases in this note are
- rarity: 1–5, the share of rare items — 5 when most items are beyond the manual
- one_liner: ≤ 20 words saying what a buyer gets; no proper nouns.` +
    jsonOnly(`{"handover_note":{"rules":[{"id":"x","text":"...","kind":"rare"|"manual","source":"q1"}],"exceptions":[...],"judgment_calls":[...],"common_mistakes":[...],"never_do":[...]},"generalization_log":[{"type":"company","replaced_with":"the carrier","count":2}],"card":{"field":"...","difficulty":1-5,"rarity":1-5,"one_liner":"..."}}`);

  const user = [
    ...(["q1", "q2", "q3", "q4"] as const).map((k) => `## ${k} — ${SEED_LABELS[k]}\n${input.seed_answers[k]}`),
    input.notes ? `## notes — their own notes/checklists\n${input.notes}` : "",
    ...input.followup_questions.map((q) => `## ${q.id} — ${q.question}\n${input.followup_answers[q.id] ?? ""}`),
  ].filter(Boolean).join("\n\n");

  const { output, run } = await callJson("extract", system, user, extractSchema, 8192);

  // 항목 id를 r1.., e1.., j1.., m1.., n1..으로 서버가 부여 (Sealed Q&A 근거 id의 기준)
  const handover_note = Object.fromEntries(
    (Object.keys(ID_PREFIX) as (keyof HandoverNote)[]).map((k) => [
      k,
      output.handover_note[k].map((it, i): NoteItem => ({ ...it, id: `${ID_PREFIX[k]}${i + 1}`, source: it.source.toLowerCase() })),
    ]),
  ) as HandoverNote;

  return { handover_note, generalization_log: output.generalization_log, card: output.card, run };
}

// ---------- ③ match ----------

export type MatchCandidate = {
  card_id: string; field: string; language: string; years_experience: number;
  difficulty: number; rarity: number; one_liner: string; item_count: number; rare_count: number;
};
export type MatchInput = { request_text: string; buyer_type: "ai_ops" | "eval_data"; candidates: MatchCandidate[] };

export async function matchCards(input: MatchInput) {
  const buyerLine = input.buyer_type === "ai_ops"
    ? "ai_ops — they run a support AI and need humans whose judgment covers the cases the AI cannot resolve."
    : "eval_data — they build evaluation data and need field judgment on where support AI tends to go wrong.";
  const system =
    `You match a buyer's need to candidate knowledge packs. You see only each card's public fields and item counts — never the sealed note.
Buyer type: ${buyerLine}
Score each candidate 0–1 on how well the card indicates coverage of the request (field, one_liner, rarity, rare_count). Return the top 3 (fewer if fewer candidates), ranks 1..3 with distinct card_ids, and a one-line reason that cites what in the card matches. Write each reason in the same language the request text is written in (cards may be in other languages — match on meaning). Do not invent coverage the card does not indicate; a weak match gets a low score, not a flattering reason.` +
    jsonOnly(`{"matches":[{"card_id":"...","rank":1,"score":0.0-1.0,"reason":"..."}]}`);

  const user = `## Request\n${input.request_text}\n\n## Candidates\n${JSON.stringify(input.candidates, null, 1)}`;
  const { output, run } = await callJson("match", system, user, matchSchema, 1024);

  // 후보에 없는 card_id 제거, 중복 제거, 점수순 → rank 1..n 재부여
  const valid = new Set(input.candidates.map((c) => c.card_id));
  const seen = new Set<string>();
  const matches = output.matches
    .filter((m) => valid.has(m.card_id) && !seen.has(m.card_id) && seen.add(m.card_id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m, i) => ({ ...m, rank: i + 1, score: Math.round(m.score * 1000) / 1000 }));
  return { matches, run };
}

// ---------- ④ sealed_qa ----------

export type SealedQaInput = { question: string; card: { field: string; one_liner: string }; handover_note: HandoverNote };
export const NOT_COVERED_ANSWER = "This pack doesn't cover that.";

export async function sealedQa(input: SealedQaInput) {
  const system =
    `You answer a buyer's question using ONLY the sealed handover note provided. The buyer has not purchased the note; they are checking whether it covers their case.
Rules:
- Answer in the same language the question is written in (the note may be in another language — translate the judgment, keep numbers, thresholds, conditions). At most 3 sentences, concrete. Paraphrase the judgment; do not reproduce the note's lists or structure.
- evidence_item_ids: the ids of the note items you relied on (e.g. "e1", "j3"). Only ids that exist in the note.
- If the note does not address the question, set covered=false, evidence_item_ids=[], and answer exactly "${NOT_COVERED_ANSWER}". Never answer from general knowledge.` +
    jsonOnly(`{"answer":"...","evidence_item_ids":["e1"],"covered":true|false}`);

  const user = `## Card\n${input.card.field} — ${input.card.one_liner}\n\n## Sealed note (server-only)\n${JSON.stringify(input.handover_note, null, 1)}\n\n## Question\n${input.question}`;
  const { output, run } = await callJson("sealed_qa", system, user, sealedQaSchema, 1024);

  // 근거 id는 실제 항목에 있는 것만; covered=false면 고정 문구·근거 0
  const ids = new Set(Object.values(input.handover_note).flat().map((it) => it.id));
  const evidence_item_ids = output.covered ? output.evidence_item_ids.filter((id) => ids.has(id)) : [];
  const covered = output.covered && evidence_item_ids.length > 0;
  return {
    answer: covered ? output.answer : NOT_COVERED_ANSWER,
    evidence_item_ids,
    covered,
    run,
  };
}
