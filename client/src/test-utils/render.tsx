/**
 * Shared RTL wrapper for Phase 3+ (QueryClient, Router, themes).
 * Phase 1: minimal re-export; extend when you add providers.
 */
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

function AllProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from "@testing-library/react";
