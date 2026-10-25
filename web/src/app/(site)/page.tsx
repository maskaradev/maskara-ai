import { ArrowRight } from "@carbon/icons-react"
import { Database, Eye, FileText, Gpu, Key } from "pixelarticons/react"

import { LogoMark } from "@/components/logo"
import { Brush } from "@/components/site/brush"
import { CopyCommand } from "@/components/site/copy-command"
import { GithubMark } from "@/components/site/github-mark"
import { DEMO_URL, DOCS_URL, INSTALL_COMMAND, QUICK_START_URL, REPO_URL, ROADMAP_URL } from "@/components/site/links"
import { MaskMock } from "@/components/site/mask-mock"
import { Nav } from "@/components/site/nav"
import { Tape } from "@/components/site/tape"
import { WaitlistForm } from "@/components/site/waitlist-form"
import { ROLES, TREATMENTS } from "@/lib/roles"

const SAMPLE_DATASETS = 4

const POLICY_LINES = [
  "full_name      → persona",
  "mrn            → pseudonymize",
  "date_of_birth  → date shift",
  "icd10_code     → keep",
  "note_text      → find & replace PII",
  "phone          → synthesize",
]

export default function Landing() {
  return (
    <>
      <Nav />

      <main>
        <section className="hero">
          <div className="wrap">
            <a className="pill" href="#local">
              <span className="pill-dot" />
              Local-first · open source
              <ArrowRight aria-hidden="true" />
            </a>
            <h1>
              Precise masking.
              <br />
              <span>Uncompromised data.</span>
            </h1>
            <p className="lede">
              maskara replaces every person with a consistent synthetic persona, across tables, documents and images, so
              the data stays fit for AI training.
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
              <b>3</b>
              <span>input lanes in one run</span>
            </div>
            <div className="stat">
              <b>{ROLES.length}</b>
              <span>column roles detected</span>
            </div>
            <div className="stat">
              <b>{TREATMENTS.length}</b>
              <span>column treatments</span>
            </div>
            <div className="stat">
              <b>{SAMPLE_DATASETS}</b>
              <span>sample datasets built in</span>
            </div>
          </div>
        </section>

        <section className="section" id="demo">
          <div className="wrap">
            <div className="head">
              <p className="kicker">Before and after</p>
              <h2>One patient, every format.</h2>
              <p>
                Her notes, a scanned form, a photo and a voicemail, masked into one persona. Each tab plays a lane;
                hover to pause, and every name, number and face here is synthetic on both sides.
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
                <MaskMock />
              </div>
            </div>
          </div>
        </section>

        <section className="section local invert" id="local">
          <div className="wrap">
            <div className="head">
              <p className="kicker">Local by design</p>
              <h2>The data stays where it lives.</h2>
              <p>
                Regulated institutions like hospitals and banks can&apos;t send their records to an outside cloud to be
                cleaned. maskara goes to the data instead: it reads your database without writing to it, masks inside
                your network, and only the masked copy ever leaves.
              </p>
            </div>

            <div className="perimeter" aria-label="maskara runs inside your network; only masked data leaves">
              <div className="zone">
                <span className="zone-label">your network</span>
                <div className="flow">
                  <div className="node">
                    <Database className="px" aria-hidden="true" />
                    <b>Source DB</b>
                    <small>read-only</small>
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
                    <small>ready to export</small>
                  </div>
                </div>
                <div className="deps">
                  <span>
                    <Gpu className="px" aria-hidden="true" />
                    Local LLM on your GPUs
                  </span>
                  <span>
                    <Eye className="px" aria-hidden="true" />
                    Vision models on your GPUs
                  </span>
                  <span>
                    <Key className="px" aria-hidden="true" />
                    Persona map, encrypted with your key
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
              The <a href={DEMO_URL}>public demo</a> shows results precomputed on synthetic sample data, so nothing is
              uploaded; on your own data, maskara runs on your machine. A supported on-prem build is on the way.{" "}
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
                  Each person key gets exactly one persona, and that person becomes the same persona in the patient
                  table, the notes, the PDFs and the photos. A model trained on the output still sees one patient with
                  one history.
                </p>
                <div className="ev" aria-hidden="true">
                  <div className="ev-head">
                    MRN-100627 <ArrowRight /> <b>Renee Coleman</b>
                  </div>
                  {["patients.csv", "clinical_notes.csv", "lab_requisition.pdf", "clinical_photo.png"].map((file) => (
                    <div className="ev-row" key={file}>
                      <span>{file}</span>
                      <b>Renee Coleman</b>
                    </div>
                  ))}
                </div>
              </article>

              <article className="card">
                <h3>Dates move. Intervals don&apos;t.</h3>
                <p>Each patient&apos;s dates shift by one offset, so gaps, order and ages survive.</p>
                <div className="ev" aria-hidden="true">
                  <div className="ev-row">
                    <span>visit 1</span>
                    <b>
                      <s>2026-01-08</s> 2026-02-17
                    </b>
                  </div>
                  <div className="ev-row">
                    <span>visit 2</span>
                    <b>
                      <s>2026-02-19</s> 2026-03-31
                    </b>
                  </div>
                  <div className="ev-row total">
                    <span>gap</span>
                    <b>42 days → 42 days</b>
                  </div>
                </div>
              </article>

              <article className="card">
                <h3>Tables, documents and photos.</h3>
                <p>Columns by policy, text and PDF pages by PII detection, faces repainted as the persona.</p>
                <div className="ev chips" aria-hidden="true">
                  <span>Columns</span>
                  <span>Free text</span>
                  <span>PDF (OCR)</span>
                  <span>Faces</span>
                  <span>Text in images</span>
                  <span className="soon">Audio, next</span>
                </div>
              </article>

              <article className="card">
                <h3>AI proposes. A person signs off.</h3>
                <p>Each column gets a suggested treatment. Nothing runs until someone confirms the policy.</p>
                <div className="ev">
                  <Tape prompt="suggest" lines={POLICY_LINES} />
                </div>
              </article>

              <article className="card">
                <h3>Proof, not promises.</h3>
                <p>The report searches the output for anything left behind and checks what had to survive.</p>
                <div className="ev" aria-hidden="true">
                  <div className="ev-row">
                    <span>originals left in output</span>
                    <b className="big">0</b>
                  </div>
                  <div className="ev-row">
                    <span>visit gaps</span>
                    <b>preserved</b>
                  </div>
                  <div className="ev-row">
                    <span>table joins</span>
                    <b>preserved</b>
                  </div>
                  <div className="ev-row">
                    <span>same query</span>
                    <b>same answer</b>
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
              <h2>Running it inside a hospital or bank?</h2>
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
            <p>Install it and run it on your own machine; the quick start walks you through the first run.</p>
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
