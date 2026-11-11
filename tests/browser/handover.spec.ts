import { expect, test } from "@playwright/test";
import { openWorkspace, resetDemo, useRole } from "./support";

test.describe("handover publish, report and acknowledgement", () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await useRole(page, "lead");
  });

  test("assembles from recipient permissions, publishes once and exports only the snapshot", async ({
    page,
  }) => {
    await openWorkspace(page, "/handovers");
    const create = page.locator("form.panel").filter({ hasText: "Build a handover" });
    await create.getByLabel("Recipient role").selectOption("incoming");
    await create.getByLabel("Title").fill("CampusConnect <script>alert(1)</script> handover");
    await create.getByRole("button", { name: "Generate draft" }).click();

    const card = page.locator(".handover-card").first();
    await expect(card).toBeVisible();
    await expect(card.getByText("Draft").first()).toBeVisible();
    await expect(card.getByText(/excluded by recipient permissions/)).toBeVisible();
    await expect(card.getByText("Synthetic sponsor commitment")).toHaveCount(0);

    const list = await page.request.get("/api/handovers");
    const payload = (await list.json()) as { handovers: { id: string }[] };
    const handoverId = payload.handovers[0].id;

    const draftReport = await page.request.get(`/api/handovers/${handoverId}/report`);
    expect(draftReport.status()).toBe(409);
    const draftBody = (await draftReport.json()) as { error?: { code?: string } };
    expect(draftBody.error?.code).toBe("NOT_PUBLISHED");

    await card.getByRole("button", { name: "Publish this version" }).click();
    await expect(page.getByText("Published").first()).toBeVisible();
    await expect(card.getByRole("link", { name: "Printable report" })).toBeVisible();

    const secondPublish = await page.request.post(`/api/handovers/${handoverId}/publish`, {
      data: {},
    });
    expect(secondPublish.status()).toBe(409);

    const report = await page.request.get(`/api/handovers/${handoverId}/report`);
    expect(report.status()).toBe(200);
    expect(report.headers()["cache-control"]).toBe("no-store");
    const html = await report.text();
    expect(html).toContain("CampusConnect");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("incoming recipient acknowledges the published version; duplicates are rejected", async ({
    page,
  }) => {
    await openWorkspace(page, "/handovers");
    const create = page.locator("form.panel").filter({ hasText: "Build a handover" });
    await create.getByRole("button", { name: "Generate draft" }).click();

    const leadCard = page.locator(".handover-card").first();
    await leadCard.getByRole("button", { name: "Publish this version" }).click();
    await expect(page.getByText("Published").first()).toBeVisible();

    const list = await page.request.get("/api/handovers");
    const payload = (await list.json()) as { handovers: { id: string }[] };
    const handoverId = payload.handovers[0].id;

    await useRole(page, "incoming");
    await openWorkspace(page, "/handovers");
    await expect(page.getByText("Build a handover")).toHaveCount(0);
    await expect(page.getByText(/Only published/i).first()).toBeVisible();

    const card = page.locator(".handover-card").first();
    await expect(card.getByText("Published").first()).toBeVisible();
    await card.getByLabel("Receipt note").fill("Received and understood.");
    await card.getByRole("button", { name: "Acknowledge receipt" }).click();
    await expect(
      page.getByText("Receipt acknowledged. The action is recorded in the audit trail."),
    ).toBeVisible();

    const duplicate = await page.request.post(`/api/handovers/${handoverId}/acknowledge`, {
      data: { note: "Second attempt." },
    });
    expect(duplicate.status()).toBe(409);

    const deniedPublish = await page.request.post(`/api/handovers/${handoverId}/publish`, {
      data: {},
    });
    expect(deniedPublish.status()).toBe(403);

    await openWorkspace(page, "/timeline");
    await expect(page.getByText("handover.acknowledged").first()).toBeVisible();
    await expect(page.getByText("handover.published").first()).toBeVisible();
  });

  test("a non-recipient cannot acknowledge the handover", async ({ page }) => {
    await openWorkspace(page, "/handovers");
    const create = page.locator("form.panel").filter({ hasText: "Build a handover" });
    await create.getByRole("button", { name: "Generate draft" }).click();
    const card = page.locator(".handover-card").first();
    await card.getByRole("button", { name: "Publish this version" }).click();
    await expect(page.getByText("Published").first()).toBeVisible();

    const list = await page.request.get("/api/handovers");
    const payload = (await list.json()) as { handovers: { id: string }[] };
    const handoverId = payload.handovers[0].id;

    await useRole(page, "reviewer");
    const denied = await page.request.post(`/api/handovers/${handoverId}/acknowledge`, {
      data: { note: "Reviewer should not acknowledge." },
    });
    expect(denied.status()).toBe(403);
  });
});
