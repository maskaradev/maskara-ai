// TEMPORARY: raw privacy-filter passthrough. Delete after use.
export async function POST(request: Request) {
  const { path, body } = await request.json()
  const res = await fetch(`https://gx10-a4ea.tail0fa1f7.ts.net:8443/privacy-filter${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } })
}
