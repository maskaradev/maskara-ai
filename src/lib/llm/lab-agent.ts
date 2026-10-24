import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import { ROLE_TREATMENT, ROLES } from "@/lib/roles"
import type { ColumnRole } from "@/lib/types"

// The Lab's chat agent. It only ever sees the masked side of a run: the schema with a few masked
// sample rows here, and whatever its own code returns. The code runs in the user's browser.

const MODEL = "claude-opus-5-5"
const MAX_SAMPLE_CHARS = 300

export const LabRequestSchema = z.object({
  tables: z
    .array(
      z.object({
        name: z.string().max(200),
        rowCount: z.number().int().nonnegative(),
        columns: z.array(z.object({ name: z.string().max(200), role: z.enum(ROLES as [ColumnRole, ...ColumnRole[]]) })).max(200),
        samples: z.array(z.record(z.string(), z.string())).max(5),
      }),
    )
    .min(1)
    .max(50),
  // Content blocks are passed back to the API exactly as it returned them (thinking blocks included).
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]) }))
    .min(1)
    .max(400),
})

export type LabRequest = z.infer<typeof LabRequestSchema>

const RUN_JS_TOOL = "run_js"

const SYSTEM = `You are the data analyst in maskara's Lab. The user has de-identified a dataset with maskara and now explores, reshapes and exports the masked result by chatting with you.

About the data:
- Every value is already masked. Names are consistent synthetic personas, person keys and other IDs are consistent pseudonyms, dates are shifted by one offset per person (intervals and ages within a person survive; absolute calendar dates are not real), contact details and addresses are synthetic, and free text has its identifiers replaced.
- The same person keeps the same pseudonym in every table, so joins on the person key work.
- Never try to re-identify anyone or guess original values. If asked, explain that the Lab only holds masked data.

How to work:
- Use the ${RUN_JS_TOOL} tool to compute anything about the data. Don't guess numbers from the samples.
- Keep each call focused; chain several calls when a task has steps.
- When a result is a table, return an array of flat objects from the code; the user sees it as a table they can download, so don't repeat it as a markdown table. Summarize what it shows in a sentence or two instead.
- When the user wants a dataset to keep (a cleaned table, a feature table, a training set), build it and save it with save(name, rows) so they can download it and later code can read it.
- Reply in the user's language. Be brief. Light markdown is fine: short paragraphs, bullet lists, **bold**, \`code\`.`

const TOOL_DESCRIPTION = `Runs JavaScript in a sandboxed Web Worker in the user's browser, against the masked tables.

The code is the body of an async function. Available inside it:
- tables: an object of arrays of row objects, keyed by table name. Every value is a string ("" when empty). Tables saved earlier with save() are included.
- save(name, rows): stores an array of flat row objects as a derived table the user can download; later calls see it as tables[name]. Returns a short confirmation.
- console.log(...): output is returned to you.

Return the result with a return statement. Arrays of flat objects are shown to the user as a table. There is no network or DOM access, and calls time out after 10 seconds. Results longer than about 10,000 characters are cut off for you (the user still sees the full table), so return aggregates or the first rows rather than whole tables.`

const runJsTool: Anthropic.Beta.BetaTool = {
  name: RUN_JS_TOOL,
  description: TOOL_DESCRIPTION,
  // Code streams into the UI as it's written; the client validates the input before running it.
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What the code does, in a few words in the user's language, shown above the result." },
      code: { type: "string", description: "Body of an async function." },
    },
    required: ["title", "code"],
  },
}

function describeTables(tables: LabRequest["tables"]): string {
  return tables
    .map((t) => {
      const columns = t.columns.map((c) => `- ${c.name}: ${c.role} (${ROLE_TREATMENT[c.role].replace("_", "-")})`).join("\n")
      const samples = t.samples
        .map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.length > MAX_SAMPLE_CHARS ? `${v.slice(0, MAX_SAMPLE_CHARS)}…` : v]))))
        .join("\n")
      return `<table name="${t.name}" rows="${t.rowCount}">\nColumns (role and how it was masked):\n${columns}\nSample rows:\n${samples}\n</table>`
    })
    .join("\n\n")
}

let client: Anthropic | null = null

/** Streams one assistant turn. The client runs any tool calls and sends the results in the next request. */
export function streamLabTurn(req: LabRequest, signal: AbortSignal) {
  const apiKey = process.env.MASKING_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("MASKING_ANTHROPIC_API_KEY is not set in .env.local.")
  client ??= new Anthropic({ apiKey })

  return client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: [
        { type: "text", text: SYSTEM },
        { type: "text", text: `The masked tables:\n\n${describeTables(req.tables)}` },
      ],
      tools: [runJsTool],
      messages: req.messages as Anthropic.Beta.BetaMessageParam[],
    },
    { signal },
  )
}
