import { expect, type Page } from "@playwright/test";

export type DemoRole = "lead" | "reviewer" | "treasurer" | "incoming";

/** Restores the process-local synthetic fixtures before each test. */
export async function resetDemo(page: Page): Promise<void> {
  const response = await page.request.post("/api/reset");
  expect(response.ok(), "demo reset should succeed").toBeTruthy();
}

/** Sets the preview role cookie through the demo-only endpoint. */
export async function useRole(page: Page, role: DemoRole): Promise<void> {
  const response = await page.request.post("/api/role", { data: { role } });
  expect(response.ok(), `role switch to ${role} should succeed`).toBeTruthy();
}

export async function openWorkspace(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator(".app-shell")).toBeVisible();
}
