// One patient from the web prototype's synthetic hospital sample (removed; see git history): P009 Aisha Rahman,
// who has a clinical note, a portal message, a lab requisition, a clinical photo and a voicemail.
// The masked side is what the pipeline produces for her; the repainted face is real output of the
// face repaint model, cropped to the photo (public/landing).

/** Text with replaced spans: [entity, original, masked]. Spans sharing an entity are one fact. */
export type Seg = string | [entity: string, original: string, masked: string]

export const PATIENT = {
  id: "P009",
  name: "Aisha Rahman",
  persona: "Renee Coleman",
  mrn: "MRN-100627",
  about: "38F · Endocrinology",
  shift: "+17d",
}

/** The persona map: every lane draws from the same one, so each fact is replaced the same way everywhere. */
export const PERSONA_MAP: { entity: string; label: string; original: string; masked: string }[] = [
  { entity: "name", label: "name", original: "Aisha Rahman", masked: "Renee Coleman" },
  { entity: "kin", label: "sister", original: "Fatima Rahman", masked: "Monique Coleman" },
  { entity: "dob", label: "birth date", original: "1988-02-08", masked: "1988-02-25" },
  { entity: "mrn", label: "mrn", original: "MRN-100627", masked: "MRN-583914" },
  { entity: "phone", label: "phone", original: "(555) 010-5579", masked: "(555) 016-2084" },
  { entity: "email", label: "email", original: "aisha.r@example.com", masked: "renee.c@example.com" },
  { entity: "addr", label: "address", original: "61 Willow Bend", masked: "17 Harrow Ln" },
  { entity: "dr", label: "physician", original: "Dr. Nadia Farouk", masked: "Dr. Miriam Shah" },
]

export const NOTES: { id: string; header: Seg[]; text: Seg[] }[] = [
  {
    id: "N013",
    header: [
      ["date", "2026-02-17", "2026-03-06"],
      " · Endocrinology · E05.00 · ",
      ["dr", "Dr. Nadia Farouk", "Dr. Miriam Shah"],
    ],
    text: [
      ["name", "Aisha Rahman", "Renee Coleman"],
      ", 38F, Graves disease. TSH suppressed. She mentioned her sister ",
      ["kin", "Fatima Rahman", "Monique Coleman"],
      " was treated here for the same condition last year. Started methimazole. Prefers contact at ",
      ["email", "aisha.r@example.com", "renee.c@example.com"],
      ".",
    ],
  },
  {
    id: "M005",
    header: [["date", "2026-02-17", "2026-03-06"], " · Endocrinology · portal message"],
    text: [
      "Portal message from ",
      ["name", "Aisha Rahman", "Renee Coleman"],
      ": asks that results go to ",
      ["email", "aisha.r@example.com", "renee.c@example.com"],
      " instead of her home address on ",
      ["addr", "Willow Bend", "Harrow Ln"],
      ". Sister ",
      ["kin", "Fatima Rahman", "Monique Coleman"],
      " will accompany her to the next visit.",
    ],
  },
  {
    id: "M008",
    header: [["date", "2026-02-17", "2026-03-06"], " · Registration · photo ID"],
    text: [
      ["name", "Aisha Rahman", "Renee Coleman"],
      " issued a new patient photo ID at the front desk. Old card reported lost; sister ",
      ["kin", "Fatima Rahman", "Monique Coleman"],
      " picked up the replacement.",
    ],
  },
]

/** media/images/M005_lab_requisition.png, as the form fields OCR reads off the page. */
export const FORM: { section?: string; label: string; entity?: string; original: string; masked?: string }[] = [
  { section: "Patient", label: "Name", entity: "name", original: "Aisha Rahman", masked: "Renee Coleman" },
  { label: "Date of birth", entity: "dob", original: "02/08/1988", masked: "02/25/1988" },
  { label: "MRN", entity: "mrn", original: "MRN-100627", masked: "MRN-583914" },
  { label: "Phone", entity: "phone", original: "(555) 010-5579", masked: "(555) 016-2084" },
  {
    label: "Address",
    entity: "addr",
    original: "61 Willow Bend, Springfield, IL 62707",
    masked: "17 Harrow Ln, Springfield, IL 62707",
  },
  { label: "Insurance", entity: "ins", original: "AET-77455012", masked: "AET-31908476" },
  {
    section: "Order",
    label: "Ordering physician",
    entity: "dr",
    original: "Dr. Nadia Farouk",
    masked: "Dr. Miriam Shah",
  },
  { label: "Collection date", entity: "date", original: "02/17/2026", masked: "03/06/2026" },
  { label: "Diagnosis", original: "E05.00 Graves disease" },
  { label: "Tests", original: "TSH, Free T4, TSI" },
]

/** media/photos/M009_clinical_photo.png, cropped to the photo (800×740 from y=48). */
export const PHOTO = {
  original: "/landing/p009-original.webp",
  masked: "/landing/p009-masked.webp",
  // Face detector output on the crop, as fractions of the image.
  box: { left: 0.2155, top: 0.1389, width: 0.5448, height: 0.7835 },
  landmarks: [
    [0.367, 0.449],
    [0.612, 0.445],
    [0.496, 0.603],
    [0.378, 0.709],
    [0.6, 0.708],
  ],
  label: ["dr", "Dr. Nadia Farouk", "Dr. Miriam Shah"] as Seg,
  caption: [
    ["name", "Aisha Rahman", "Renee Coleman"],
    "  MRN ",
    ["mrn", "100627", "583914"],
    "  DOB ",
    ["dob", "02/08/1988", "02/25/1988"],
  ] as Seg[],
  sub: ["Endocrinology · Graves ophthalmopathy baseline · ", ["date", "2026-02-17", "2026-03-06"]] as Seg[],
}

/** media/audio/M005_voicemail.mp3 (20.5 s): peak level per slice, and the transcript. */
export const VOICEMAIL = {
  duration: "0:20",
  peaks: [
    0.48, 1.0, 0.93, 0.98, 0.92, 0.58, 0.62, 0.47, 0.75, 0.46, 0.31, 0.78, 0.73, 0.69, 0.65, 0.72, 0.97, 0.65, 0.51,
    0.76, 0.01, 0.06, 0.42, 0.26, 0.68, 0.98, 0.59, 0.57, 0.01, 0.0, 0.0, 0.29, 0.62, 0.73, 0.57, 0.56, 0.43, 0.24,
    0.51, 0.82, 0.54, 0.54, 0.35, 0.98, 0.23, 0.36, 0.73, 0.58, 0.6, 0.59, 0.41, 0.0, 0.0, 0.03, 0.8, 0.94, 0.58, 0.46,
    0.6, 0.71, 0.56, 0.6, 0.4, 0.52, 0.67, 0.6, 0.47, 0.6, 0.46, 0.38, 0.3, 0.41, 0.51, 0.46, 0.71, 0.45, 0.63, 0.5,
    0.56, 0.38, 0.34, 0.31, 0.44, 0.32, 0.39, 0.37, 0.09, 0.01, 0.84, 0.59, 0.81, 0.66, 0.95, 0.61, 0.76, 0.01, 0.38,
    0.35, 0.39, 0.35, 0.78, 0.68, 0.56, 0.29, 0.38, 0.25, 0.0, 0.01, 0.36, 0.23, 0.69, 0.8, 0.57, 0.01, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0,
  ],
  transcript: [
    "Hello, this is ",
    ["name", "Aisha Rahman", "Renee Coleman"],
    ", date of birth ",
    ["dob", "February 8, 1988", "February 25, 1988"],
    ". I'm calling for Doctor ",
    ["dr", "Farouk", "Shah"],
    " about my thyroid results. Please email them to ",
    ["email", "aisha dot r at example dot com", "renee dot c at example dot com"],
    ", or call me at ",
    ["phone", "5 5 5, 0 1 0, 5 5 7 9", "5 5 5, 0 1 6, 2 0 8 4"],
    ". Thanks so much.",
  ] as Seg[],
}
