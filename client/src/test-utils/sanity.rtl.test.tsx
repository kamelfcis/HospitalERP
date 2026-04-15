/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Confirms jsdom + React Testing Library + jest-dom matchers (Phase 1 smoke).
 */
describe("test stack (jsdom + RTL)", () => {
  it("renders visible text", () => {
    render(<div>HospitalERP</div>);
    expect(screen.getByText("HospitalERP")).toBeInTheDocument();
  });
});
