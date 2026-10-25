import { ArrowRight } from "@carbon/icons-react"
import { Cpu, FileText, Grid3x3, Key, Search } from "pixelarticons/react"

import { LogoMark } from "@/components/logo"
import { Brush } from "@/components/site/brush"
import { CopyCommand } from "@/components/site/copy-command"
import { GithubMark } from "@/components/site/github-mark"
import { DEMO_URL, DOCS_URL, INSTALL_COMMAND, QUICK_START_URL, REPO_URL, ROADMAP_URL } from "@/components/site/links"
import { Nav } from "@/components/site/nav"
import { EVIDENCE, EXCERPT, REPORT, SUBJECT, type Redactable } from "@/components/site/sample-data"
import { SampleMock } from "@/components/site/sample-mock"
import { Tape } from "@/components/site/tape"
import { WaitlistForm } from "@/components/site/waitlist-form"

const pct = (share: number) => `${Math.round(share * 1000) / 10}%`

/** Mirrors `maskara mask --help` and the summary `maskara demo` prints for the sample store. */
const MASK_LINES = [
  "--preset balanced",
  "→ rules + known values",
  `→ replaced ${REPORT.replaced} values`,
  "--detector gliner2",
  "--pattern legal-echr",
]

/** The same lines three ways: as written, as a typical redaction leaves them, and as maskara leaves them. */
const WHY_PANES = [
  { kind: "original", label: "original" },
  { kind: "redacted", label: "typical redaction" },
  { kind: "masked", label: "maskara" },
] as const

function Excerpt({ kind }: { kind: (typeof WHY_PANES)[number]["kind"] }) {
  const span = (s: Exclude<Redactable, string>) => (kind === "original" ? s[1] : kind === "redacted" ? s[3] : s[2])
  return EXCERPT.map((line, i) => (
    <span className="why-line" key={i}>
      {line.map((s, j) => (typeof s === "string" ? s : <mark key={j}>{span(s)}</mark>))}
    </span>
  ))
}

export default function Landing() {
  return (
    <>
      <Nav />

      <main>
        <section className="hero">
          <div className="wrap">
            <a className="pill" href="#local">
              <span className="pill-dot" />
              Open source · runs on your machine
              <ArrowRight aria-hidden="true" />
            </a>
            <h1>
              Precise masking.
              <br />
              <span>Uncompromised data.</span>
            </h1>
            <p className="lede">
              maskara swaps every person in your tables and text for a consistent synthetic persona instead of
              [REDACTED], then shows you what leaked and what still works.
            </p>
            <div className="go">
              <a className="btn btn-primary" href={DEMO_URL}>
                Try the demo <ArrowRight aria-hidden="true" />
              </a>
              <a className="btn btn-secondary" href={REPO_URL}>
                View on GitHub
              </a>
              <CopyCommand command={INSTALL_COMMAND} />
            </div>
          </div>
        </section>

        <section className="stats" aria-label="maskara in numbers">
          <div className="wrap">
            <div className="stat">
              <b>150k</b>
              <span>personas to draw from, bundled</span>
            </div>
            <div className="stat">
              <b>0</b>
              <span>runtime dependencies</span>
            </div>
            <div className="stat">
              <b>3</b>
              <span>presets, strict to max utility</span>
            </div>
            <div className="stat">
              <b>4</b>
              <span>benchmark corpora</span>
            </div>
          </div>
        </section>

        <section className="section" id="demo">
          <div className="wrap">
            <div className="head">
              <p className="kicker">Before and after</p>
              <h2>One customer, every table and text.</h2>
              <p>
                Their row, their orders, a support transcript and an agent&apos;s note, masked into one persona. Each
                tab is a different input; hover to pause. It&apos;s the sample store bundled with maskara, so every
                value here is synthetic on both sides.
              </p>
            </div>
            <div className="window">
              <div className="window-bar" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>maskara · synthetic sample</span>
              </div>
              <div className="plate">
                <SampleMock />
              </div>
            </div>
          </div>
        </section>

        <section className="section why-section" id="why">
          <div className="wrap">
            <div className="head">
              <p className="kicker">Why not redact</p>
              <h2>Redaction keeps data safe and makes it useless.</h2>
            </div>
            <div className="why">
              {WHY_PANES.map(({ kind, label }) => (
                <figure className={`why-pane ${kind}`} key={kind}>
                  <figcaption>
                    <b>{label}</b>
                    <span>tickets.csv</span>
                  </figcaption>
                  <p>
                    <Excerpt kind={kind} />
                  </p>
                </figure>
              ))}
            </div>
            <p className="why-note">
              Once every name is [PERSON], nobody can tell who did what. A model can&apos;t learn the pattern, and an
              analyst can&apos;t join the tables or count the days between two tickets. A persona keeps those links,
              so the data still answers the same questions. maskara bench measures both sides, leaks and usefulness,
              with one scorer.{" "}
              <a href={`${REPO_URL}#benchmarks`}>
                How we measure <ArrowRight aria-hidden="true" />
              </a>
            </p>
          </div>
        </section>

        <section className="section local invert" id="local">
          <div className="wrap">
            <div className="head">
              <p className="kicker">Local by design</p>
              <h2>The data stays where it lives.</h2>
              <p>
                Sensitive records can&apos;t go to an outside cloud to be cleaned. maskara is a Python package that
                runs where the data already is, on a laptop or inside your network, and makes no network calls. Only
                the masked copy leaves.
              </p>
            </div>

            <div className="perimeter" aria-label="maskara runs inside your network; only masked data leaves">
              <div className="zone">
                <span className="zone-label">your network</span>
                <div className="flow">
                  <div className="node">
                    <Grid3x3 className="px" aria-hidden="true" />
                    <b>Your data</b>
                    <small>CSV, JSONL, DataFrames</small>
                  </div>
                  <span className="arrow" aria-hidden="true" />
                  <div className="node core">
                    <LogoMark aria-hidden="true" />
                    <b>maskara</b>
                    <small>finds and replaces PII</small>
                  </div>
                  <span className="arrow" aria-hidden="true" />
                  <div className="node">
                    <FileText className="px" aria-hidden="true" />
                    <b>Masked copy</b>
                    <small>plus a report</small>
                  </div>
                </div>
                <div className="deps">
                  <span>
                    <Search className="px" aria-hidden="true" />
                    Rules and your tables&apos; own values
                  </span>
                  <span>
                    <Cpu className="px" aria-hidden="true" />
                    Optional GLiNER2 model, on CPU
                  </span>
                  <span>
                    <Key className="px" aria-hidden="true" />
                    Vault of keyed hashes, no originals
                  </span>
                </div>
              </div>
              <div className="outside">
                <span className="cut" aria-hidden="true" />
                <div>
                  <b>The originals</b>
                  <small>never cross this line</small>
                </div>
              </div>
            </div>

            <p className="footnote">
              The <a href={DEMO_URL}>public demo</a> is precomputed on synthetic sample data, so nothing is uploaded. A
              supported on-prem build for teams is on the way.{" "}
              <a href={ROADMAP_URL}>
                See the roadmap <ArrowRight aria-hidden="true" />
              </a>
            </p>
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <div className="head">
              <p className="kicker">How it works</p>
              <h2>Everything a model needs survives the mask.</h2>
            </div>

            <div className="bento">
              <article className="card wide">
                <h3>Same person, same persona. Everywhere.</h3>
                <p>
                  Each person gets exactly one persona, in every table and every text that mentions them. With a vault,
                  they get the same one on the next run too.
                </p>
                <div className="ev" aria-hidden="true">
                  <div className="ev-head">
                    {SUBJECT.id} <ArrowRight /> <b>{SUBJECT.persona}</b>
                  </div>
                  {[
                    ["customers.csv", SUBJECT.persona],
                    ["orders.csv", SUBJECT.maskedId],
                    ["tickets.csv", SUBJECT.persona],
                    ["notes.jsonl", SUBJECT.persona],
                  ].map(([file, value]) => (
                    <div className="ev-row" key={file}>
                      <span>{file}</span>
                      <b>{value}</b>
                    </div>
                  ))}
                </div>
              </article>

              <article className="card">
                <h3>Dates move. Intervals don&apos;t.</h3>
                <p>Each person&apos;s dates shift by one offset, so gaps and order survive.</p>
                <div className="ev" aria-hidden="true">
                  <div className="ev-row">
                    <span>order</span>
                    <b>
                      <s>{EVIDENCE.placed[0]}</s> {EVIDENCE.placed[1]}
                    </b>
                  </div>
                  <div className="ev-row">
                    <span>ticket</span>
                    <b>
                      <s>{EVIDENCE.opened[0]}</s> {EVIDENCE.opened[1]}
                    </b>
                  </div>
                  <div className="ev-row total">
                    <span>gap</span>
                    <b>
                      {EVIDENCE.gap[0]} days → {EVIDENCE.gap[1]} days
                    </b>
                  </div>
                </div>
              </article>

              <article className="card">
                <h3>Joins keep working.</h3>
                <p>An id gets the same replacement in every table and text, and its prefix stays.</p>
                <div className="ev" aria-hidden="true">
                  <div className="ev-row">
                    <span>customer</span>
                    <b>
                      <s>{EVIDENCE.customer[0]}</s> {EVIDENCE.customer[1]}
                    </b>
                  </div>
                  <div className="ev-row">
                    <span>order</span>
                    <b>
                      <s>{EVIDENCE.order[0]}</s> {EVIDENCE.order[1]}
                    </b>
                  </div>
                  <div className="ev-row total">
                    <span>joins broken</span>
                    <b>
                      {REPORT.brokenJoins} of {REPORT.joinsChecked}
                    </b>
                  </div>
                </div>
              </article>

              <article className="card">
                <h3>Rules, your tables, and a model.</h3>
                <p>
                  Rules catch the formats, values your tables already know are found again in free text, and GLiNER2 is
                  one extra away. Domain ids come as opt-in packs.
                </p>
                <div className="ev">
                  <Tape prompt="maskara mask" lines={MASK_LINES} />
                </div>
              </article>

              <article className="card">
                <h3>Proof, not promises.</h3>
                <p>
                  Every run comes with a report: what it searched for, what it found, and what it couldn&apos;t
                  measure.
                </p>
                <div className="ev" aria-hidden="true">
                  <div className="ev-row">
                    <span>originals left in output</span>
                    <b className="big">{REPORT.originalsFound}</b>
                  </div>
                  <div className="ev-row">
                    <span>joins broken</span>
                    <b>{REPORT.brokenJoins}</b>
                  </div>
                  <div className="ev-row">
                    <span>date gaps exact</span>
                    <b>{pct(REPORT.dateGapsExact)}</b>
                  </div>
                  <div className="ev-row">
                    <span>linkage attack re-identified</span>
                    <b>{pct(REPORT.reidentified / REPORT.linkageAttempted)}</b>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section waitlist-section" id="waitlist">
          <div className="wrap">
            <div className="head">
              <p className="kicker">Teams and on-prem</p>
              <h2>Running it inside a bank or a hospital?</h2>
              <p>
                We&apos;re preparing a supported on-prem build for teams. Join the waitlist and we&apos;ll reach out
                when it&apos;s ready.
              </p>
            </div>
            <WaitlistForm />
          </div>
        </section>

        <section className="end">
          <Brush center={[0.5, 0.52]} angle={7} span={0.6} flip />
          <div className="wrap">
            <div className="tile" aria-hidden="true">
              <LogoMark />
            </div>
            <h2>Give your data a new face.</h2>
            <p>
              Install it and mask the sample store in a couple of seconds; the quick start walks you through your own
              data.
            </p>
            <div className="go">
              <CopyCommand command={INSTALL_COMMAND} />
              <a className="btn btn-secondary" href={QUICK_START_URL}>
                Quick start <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot-brand">
            <LogoMark />
            <b>maskara</b>
            <span>Apache-2.0</span>
          </div>
          <nav className="foot-links">
            <a href="#waitlist">Waitlist</a>
            <a href={DOCS_URL}>Docs</a>
            <a href={ROADMAP_URL}>Roadmap</a>
            <a className="gh" href={REPO_URL} aria-label="maskara on GitHub">
              <GithubMark />
            </a>
          </nav>
        </div>
      </footer>
    </>
  )
}
