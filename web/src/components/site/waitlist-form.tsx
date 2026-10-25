"use client"

import { ArrowRight } from "@carbon/icons-react"
import { useState } from "react"

import { REPO_URL } from "@/components/site/links"
import { HONEYPOT_FIELD, WAITLIST_LIMITS, WAITLIST_PATH } from "@/lib/waitlist"

type Status = { state: "idle" | "sending" | "done" } | { state: "error"; message: string }

export function WaitlistForm() {
  const [status, setStatus] = useState<Status>({ state: "idle" })

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus({ state: "sending" })
    const fields = Object.fromEntries(new FormData(e.currentTarget))
    try {
      const res = await fetch(WAITLIST_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) setStatus({ state: "done" })
      else setStatus({ state: "error", message: data?.error ?? "Something went wrong." })
    } catch {
      setStatus({ state: "error", message: "Could not reach the server." })
    }
  }

  if (status.state === "done") {
    return (
      <div className="waitlist done" role="status">
        <b>You&apos;re on the list.</b>
        <p>We&apos;ll be in touch about team and on-prem access.</p>
      </div>
    )
  }

  return (
    <form className="waitlist" onSubmit={submit}>
      <label>
        <span>Work email</span>
        <input name="email" type="email" required maxLength={WAITLIST_LIMITS.email} autoComplete="email" placeholder="you@hospital.org" />
      </label>
      <label>
        <span>
          Company <small>optional</small>
        </span>
        <input name="company" maxLength={WAITLIST_LIMITS.company} autoComplete="organization" />
      </label>
      <label>
        <span>
          What would you use it for? <small>optional</small>
        </span>
        <textarea name="useCase" rows={3} maxLength={WAITLIST_LIMITS.useCase} placeholder="Masking clinical notes for model training, …" />
      </label>
      <label className="hp" aria-hidden="true">
        Website
        <input name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
      </label>
      {status.state === "error" && (
        <p className="waitlist-error" role="alert">
          {status.message} You can also reach us on <a href={REPO_URL}>GitHub</a>.
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={status.state === "sending"}>
        {status.state === "sending" ? "Joining…" : "Join the waitlist"} <ArrowRight aria-hidden="true" />
      </button>
      <p className="waitlist-note">
        We only use this to contact you about team and on-prem access. maskara never collects the data you mask.
      </p>
    </form>
  )
}
