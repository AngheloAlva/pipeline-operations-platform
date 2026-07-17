import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { INITIAL_CAPTURE_SLICE, useCaptureStore } from "@/store/captureStore";
import { BalancePanel } from "./BalancePanel";

describe("BalancePanel propagation", () => {
  beforeEach(() => useCaptureStore.setState(INITIAL_CAPTURE_SLICE));

  it("renders a sequence-keyed highlight for the latest confirmed capture", () => {
    useCaptureStore.setState({
      lastPropagation: {
        sequence: 3,
        recordId: "CAP-0003",
        tankIds: [],
        highlightBalance: true,
        highlightCustody: true,
      },
    });
    render(<BalancePanel movements={[]} />);
    const panel = screen.getByRole("region", { name: /balance horario/i });
    expect(panel.querySelector(".capture-propagation-highlight")).toBeTruthy();
  });
});
