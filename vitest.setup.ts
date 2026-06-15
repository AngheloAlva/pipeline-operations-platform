/// <reference types="vitest/globals" />

// Vitest setup file — reserved for jsdom/RTL matchers in later phases

// jsdom does not implement HTMLDialogElement.showModal/close natively.
// Mock them globally so any component that uses <dialog> (e.g. ConceptInfo)
// does not throw during test renders. The mocks are no-ops; interaction tests
// assert rendered DOM state rather than native dialog behavior.
import { vi } from "vitest";
HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();
