"use client"

import { useState } from "react"

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="cmd">
      <code>
        <b>$</b>
        {command}
      </code>
      <button
        type="button"
        aria-label="Copy command"
        onClick={() =>
          navigator.clipboard
            .writeText(command)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            })
            .catch(() => {})
        }
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  )
}
