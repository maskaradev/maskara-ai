import Anthropic from "@anthropic-ai/sdk"

import { hostedAppOff } from "@/lib/hosted-app"
import { LabRequestSchema, streamLabTurn } from "@/lib/llm/lab-agent"
import type { LabEvent } from "@/lib/lab"

// Streams one assistant turn as newline-delimited JSON (see LabEvent).

const MAX_ATTEMPTS = 3

function apiErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "Anthropic API key is invalid. Check MASKING_ANTHROPIC_API_KEY in .env.local."
  if (error instanceof Anthropic.RateLimitError) return "Anthropic API rate limit reached. Try again shortly."
  if (error instanceof Anthropic.APIError) return `Anthropic API error ${error.status}: ${error.message}`
  return error instanceof Error ? error.message : "The Lab request failed."
}

export async function POST(request: Request) {
  const off = hostedAppOff()
  if (off) return off

  const body = LabRequestSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: LabEvent) => {
        // The client may have gone away mid-turn; the closed stream just drops the event.
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        } catch {}
      }
      try {
        for (let attempt = 1; ; attempt++) {
          try {
            const turn = streamLabTurn(body.data, request.signal)
            for await (const event of turn) {
              if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
                send({ type: "tool", index: event.index, name: event.content_block.name })
              } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") send({ type: "text", index: event.index, text: event.delta.text })
                else if (event.delta.type === "input_json_delta") send({ type: "input", index: event.index, json: event.delta.partial_json })
              }
            }
            const message = await turn.finalMessage()
            send({ type: "done", content: message.content, stopReason: message.stop_reason })
            break
          } catch (error) {
            // With eager input streaming, tool input the SDK can't parse at all rejects the stream before a
            // tool_use block exists to answer, so the turn is re-issued. API errors are not retried here.
            if (error instanceof Anthropic.APIError || request.signal.aborted || attempt >= MAX_ATTEMPTS) throw error
            send({ type: "retry" })
          }
        }
      } catch (error) {
        if (!request.signal.aborted) send({ type: "error", error: apiErrorMessage(error) })
      } finally {
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } })
}
