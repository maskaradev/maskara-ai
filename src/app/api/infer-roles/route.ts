import Anthropic from "@anthropic-ai/sdk"

import { InferRolesRequestSchema, inferColumnRoles } from "@/lib/llm/role-classifier"

export async function POST(request: Request) {
  const body = InferRolesRequestSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  try {
    return Response.json({ columns: await inferColumnRoles(body.data) })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Anthropic API key is invalid. Check MASKING_ANTHROPIC_API_KEY in .env.local." }, { status: 500 })
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Anthropic API rate limit reached. Try again shortly." }, { status: 429 })
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `Anthropic API error ${error.status}: ${error.message}` }, { status: 502 })
    }
    const message = error instanceof Error ? error.message : "Column role detection failed."
    return Response.json({ error: message }, { status: 500 })
  }
}
