import { describe, expect, it } from "vitest"
import { GLOSSARY, getTerm } from "./glossary"

describe("GLOSSARY", () => {
  it("has non-empty id, label, and short for every term", () => {
    for (const [key, term] of Object.entries(GLOSSARY)) {
      expect(term.id, `${key}.id should be non-empty`).toBeTruthy()
      expect(term.label, `${key}.label should be non-empty`).toBeTruthy()
      expect(term.short, `${key}.short should be non-empty`).toBeTruthy()
    }
  })

  it("has unique ids across all terms", () => {
    const ids = Object.values(GLOSSARY).map((t) => t.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it("has record key equal to term.id for every entry", () => {
    for (const [key, term] of Object.entries(GLOSSARY)) {
      expect(term.id).toBe(key)
    }
  })
})

describe("getTerm", () => {
  it("returns the correct term for a known id", () => {
    const term = getTerm("potencial-catodico")
    expect(term).toBeDefined()
    expect(term?.label).toBe("Potencial catódico")
  })

  it("returns undefined for an unknown id", () => {
    expect(getTerm("non-existent-term")).toBeUndefined()
  })
})
