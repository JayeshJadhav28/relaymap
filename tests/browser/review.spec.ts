import { expect, test } from "@playwright/test";
import { openWorkspace, resetDemo, useRole } from "./support";

function claimCard(page: import("@playwright/test").Page, title: string) {
  return page.locator(".claim-card").filter({ hasText: title }).first();
}

test.describe("review centre", () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await useRole(page, "lead");
  });

  test("shows exact citations and approves only after human action", async ({ page }) => {
    await openWorkspace(page, "/review");
    const card = claimCard(page, "Rider-alert reconciliation has no owner");
    await expect(card).toBeVisible();
    await expect(card.locator("blockquote").first()).toContainText(
      "CC-42 · Reconcile rider alerts · Status: Open · Assignee: Unassigned",
    );
    await expect(card.getByText(/chunk chunk-/).first()).toBeVisible();

    await card.getByRole("button", { name: "Approve", exact: true }).click();

    const history = page.locator("table.table").filter({ hasText: "Reviewer" }).first();
    const row = history
      .getByRole("row")
      .filter({ hasText: "Rider-alert reconciliation has no owner" })
      .filter({ hasText: "Meera Shah (project lead)" })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: "approve", exact: true })).toBeVisible();
    await expect(row.getByText("NEEDS_REVIEW → APPROVED")).toBeVisible();
  });

  test("rejects with a recorded justification and keeps the history", async ({ page }) => {
    await openWorkspace(page, "/review");
    const card = claimCard(page, "Confirm production deployment target");
    await card.getByLabel("Reviewer comment").fill("Owner and date need confirmation at the next stand-up.");
    await card.getByRole("button", { name: "Reject", exact: true }).click();

    const history = page.locator("table.table").filter({ hasText: "Reviewer" }).first();
    await expect(history.getByText("Confirm production deployment target")).toBeVisible();
    await expect(
      history.getByText("Owner and date need confirmation at the next stand-up."),
    ).toBeVisible();
    await expect(history.getByText("NEEDS_REVIEW → REJECTED")).toBeVisible();
  });

  test("edits a claim title and records the correction", async ({ page }) => {
    await openWorkspace(page, "/review");
    const card = claimCard(page, "Add backup owner for route operations");
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await card.getByLabel("Corrected title").fill("Backup owner confirmed for route operations");
    await card
      .getByLabel("Reviewer comment")
      .fill("Backup owner is confirmed in the task board export.");
    await card.getByRole("button", { name: "Save correction" }).click();
    await expect(
      page.getByText("Backup owner confirmed for route operations").first(),
    ).toBeVisible();

    const history = page.locator("table.table").filter({ hasText: "Reviewer" }).first();
    await expect(history.getByText("edit", { exact: true })).toBeVisible();
    await expect(
      history.getByText("Backup owner is confirmed in the task board export."),
    ).toBeVisible();
  });

  test("rejects a review action without the required justification", async ({ page }) => {
    await useRole(page, "lead");
    const response = await page.request.post("/api/knowledge/k-task-backup/review", {
      data: { action: "reject" },
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("reviewer comment is required");
  });

  test("denies review authority to the incoming role", async ({ page }) => {
    await useRole(page, "incoming");
    await openWorkspace(page, "/review");
    await expect(
      page.getByText("This role can read permitted findings but cannot approve them."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    const denied = await page.request.post("/api/knowledge/k-owner/review", {
      data: { action: "approve" },
    });
    expect(denied.status()).toBe(403);
  });

  test("records approvals in the append-only audit trail", async ({ page }) => {
    await useRole(page, "lead");
    const approve = await page.request.post("/api/knowledge/k-owner/review", {
      data: { action: "approve", comment: "Verified exact citation." },
    });
    expect(approve.status()).toBe(200);

    await openWorkspace(page, "/timeline");
    await expect(page.getByText("claim.approve").first()).toBeVisible();
    await expect(page.getByText(/Task approve: Rider-alert reconciliation has no owner/i)).toBeVisible();
  });
});
