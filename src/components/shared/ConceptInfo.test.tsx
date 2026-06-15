/**
 * ConceptInfo component tests.
 * jsdom does not implement HTMLDialogElement.showModal/close — mock them.
 * @testing-library/jest-dom is not installed; use native assertions only.
 */

import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ConceptInfo } from "./ConceptInfo"

// Note: HTMLDialogElement.showModal/close are mocked globally in vitest.setup.ts.

describe("ConceptInfo", () => {
  it("renders a trigger button with accessible name for known term", () => {
    render(<ConceptInfo term="potencial-catodico" />)
    const button = screen.getByRole("button", { name: /qué es potencial catódico/i })
    expect(button).toBeTruthy()
  })

  it("renders nothing for an unknown term", () => {
    const { container } = render(<ConceptInfo term="unknown-term-xyz" />)
    expect(container.firstChild).toBeNull()
  })

  it("uses custom label in button aria-label when label prop is provided", () => {
    render(<ConceptInfo term="potencial-catodico" label="Potencial" />)
    const button = screen.getByRole("button", { name: /qué es potencial/i })
    expect(button).toBeTruthy()
  })

  it("shows term content in the DOM after button click (dialog open state)", () => {
    render(<ConceptInfo term="potencial-catodico" />)
    const button = screen.getByRole("button", { name: /qué es potencial catódico/i })
    fireEvent.click(button)
    // After click, the dialog is rendered (open state = true) and term content is present
    expect(screen.getByText("Potencial catódico")).toBeTruthy()
    expect(screen.getByText(/tensión eléctrica/i)).toBeTruthy()
  })

  it("renders a close button inside the dialog markup when open", () => {
    const { container } = render(<ConceptInfo term="criterio-085" />)
    const trigger = screen.getByRole("button", { name: /qué es criterio/i })
    fireEvent.click(trigger)
    // Query directly on the container since jsdom hides dialog contents from a11y tree
    // when the native open attribute is absent (showModal is mocked)
    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Cerrar"]'
    )
    expect(closeButton).toBeTruthy()
  })
})
