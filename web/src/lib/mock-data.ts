export type Persona = {
  id: string
  name: string
  fields: string[]
  datasets: number
  source: "Generated" | "Template"
}

// Placeholder data until the masking pipeline exists.
export const personas: Persona[] = [
  { id: "p1", name: "Avery Thompson, 34", fields: ["Face", "Name", "Age"], datasets: 3, source: "Generated" },
  { id: "p2", name: "Jordan Lee, 27", fields: ["Name", "Email"], datasets: 1, source: "Generated" },
  { id: "p3", name: "Morgan Patel, 52", fields: ["Face", "Name", "Age", "Address"], datasets: 0, source: "Template" },
  { id: "p4", name: "Riley Garcia, 41", fields: ["Voice", "Name"], datasets: 2, source: "Generated" },
  { id: "p5", name: "Casey Nguyen, 19", fields: ["Face", "Age"], datasets: 0, source: "Template" },
  { id: "p6", name: "Taylor Brooks, 63", fields: ["Name", "Phone", "SSN"], datasets: 1, source: "Generated" },
  { id: "p7", name: "Quinn Rivera, 30", fields: ["Face", "Name"], datasets: 0, source: "Template" },
  { id: "p8", name: "Drew Kim, 45", fields: ["Name", "Age", "Employer"], datasets: 4, source: "Generated" },
]
