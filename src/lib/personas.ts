import { hashDigits, hashOf, pick } from "@/lib/hash"
import type { Persona, PersonaKind } from "@/lib/types"

// Built-in pools for the MVP. Later replaced by a persona pool generated at build time.
const FEMALE = [
  "Avery", "Brooke", "Claire", "Dana", "Elena", "Fiona", "Gwen", "Hazel", "Iris", "Jenna", "Kara", "Leah",
  "Maya", "Nina", "Olive", "Paige", "Quinn", "Rosa", "Stella", "Tessa", "Una", "Vera", "Wren", "Yara",
  "Zoe", "Alma", "Bianca", "Cora", "Delia", "Erin", "Faye", "Greta", "Helen", "Ivy", "Joan", "Lena",
]
const MALE = [
  "Aaron", "Blake", "Caleb", "Dylan", "Ethan", "Felix", "Grant", "Henry", "Isaac", "Jonah", "Kyle", "Liam",
  "Miles", "Noah", "Owen", "Peter", "Reid", "Simon", "Tobias", "Victor", "Wade", "Xavier", "Yusuf", "Zane",
  "Abel", "Bruce", "Colin", "Dean", "Elliot", "Frank", "Gavin", "Hugo", "Ian", "Jared", "Leon", "Marco",
]
const LAST = [
  "Abbott", "Barnes", "Carver", "Dalton", "Ellison", "Fowler", "Garrison", "Hensley", "Ingram", "Jarvis",
  "Keller", "Lawson", "Mercer", "Norwood", "Osborne", "Prescott", "Quigley", "Ramsey", "Sutton", "Thornton",
  "Underwood", "Vance", "Whitfield", "Yardley", "Ashby", "Benton", "Crowley", "Donovan", "Easton", "Finch",
  "Goodwin", "Holt", "Iverson", "Kemp", "Lindqvist", "Marsh", "Nolan", "Pruitt", "Rowe", "Sloane",
]
export const STREET_NAMES = [
  "Elm", "Cedar", "Aspen", "Juniper", "Hawthorne", "Magnolia", "Chestnut", "Laurel", "Spruce", "Alder",
  "Poplar", "Sumac", "Hickory", "Beacon", "Summit", "Orchard", "Meadow", "Kestrel", "Ridgeline", "Foxglove",
]
export const STREET_SUFFIXES = ["St", "Ave", "Rd", "Dr", "Ln", "Ct", "Pl", "Way"]
export const CITIES = [
  "Fairhaven", "Millbrook", "Ashford", "Cedar Bluff", "Kingsbury", "Oakridge", "Brightwater", "Elmhurst Falls",
  "Hollister", "Pine Hollow", "Westmoor", "Stonebrook", "Larkspur", "Riverbend", "Glenwood Springs", "Maple Crossing",
]
export const PLACE_WORDS = [
  "Fairview", "Brookside", "Oakmont", "Pinecrest", "Hillcrest", "Westfield", "Silverlake", "Maplewood",
  "Northgate", "Ridgeview", "Clearwater", "Stonebridge", "Lakeside", "Briarwood", "Highland", "Greenfield",
]

const FEMALE_RELATIONS = /(mother|mom|daughter|wife|sister|aunt|niece|grandmother|granddaughter|girlfriend)/i
const MALE_RELATIONS = /(father|dad|son|husband|brother|uncle|nephew|grandfather|grandson|boyfriend)/i

export function sexFromRelation(relation: string | null): "F" | "M" | "U" {
  if (!relation) return "U"
  if (FEMALE_RELATIONS.test(relation)) return "F"
  if (MALE_RELATIONS.test(relation)) return "M"
  return "U"
}

export function normalizeSex(value: string | undefined): "F" | "M" | "U" {
  const v = (value ?? "").trim().toLowerCase()
  if (v === "f" || v === "female") return "F"
  if (v === "m" || v === "male") return "M"
  return "U"
}

export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z")
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10) + iso.slice(10)
}

export function fictionalPhoneDigits(salt: string, key: string): string {
  // Area code from the hash, exchange 555, line 0100-0199: the range reserved for fiction.
  const area = String(200 + (hashOf(salt, "area", key) % 780))
  return area + "55501" + hashDigits(salt, "line" + key, 2)
}

export function createPersona(
  salt: string,
  args: {
    key: string
    kind: PersonaKind
    sex: "F" | "M" | "U"
    datasetName: string
    realBirthDate?: string
    lastName?: string
  },
): Persona {
  const { key, kind, sex } = args
  const h = hashOf(salt, "persona", key)
  const firstPool = sex === "F" ? FEMALE : sex === "M" ? MALE : [...FEMALE, ...MALE]
  const firstName = pick(firstPool, h)
  const lastName = args.lastName ?? pick(LAST, hashOf(salt, "last", key))
  const dateOffsetDays = (hashOf(salt, "offset", key) % 61) - 30 || 17
  const phone = fictionalPhoneDigits(salt, key)

  return {
    key,
    kind,
    firstName,
    lastName,
    sex,
    birthDate: args.realBirthDate ? shiftIsoDate(args.realBirthDate, dateOffsetDays) : undefined,
    phone: `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`,
    email: `${firstName}.${lastName}${10 + (h % 90)}@example.com`.toLowerCase(),
    street: `${10 + (hashOf(salt, "num", key) % 8990)} ${pick(STREET_NAMES, hashOf(salt, "street", key))} ${pick(STREET_SUFFIXES, h)}`,
    city: pick(CITIES, hashOf(salt, "city", key)),
    dateOffsetDays,
    datasetName: args.datasetName,
    createdAt: new Date().toISOString(),
  }
}

export function personaAge(p: Persona, at = new Date()): number | null {
  if (!p.birthDate) return null
  const b = new Date(p.birthDate + "T00:00:00Z")
  let age = at.getUTCFullYear() - b.getUTCFullYear()
  if (at.getUTCMonth() < b.getUTCMonth() || (at.getUTCMonth() === b.getUTCMonth() && at.getUTCDate() < b.getUTCDate())) age--
  return age
}
