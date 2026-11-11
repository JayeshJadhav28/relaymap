import { expect, test } from "@playwright/test";
import { openWorkspace, resetDemo, useRole } from "./support";

test.describe("workspace shell, readiness, impact and agents", () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await useRole(page, "lead");
  });

  test("landing is explicitly synthetic and enters the labelled demo", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response?.headers()["x-frame-options"]).toBe("DENY");

    await expect(page.getByRole("heading", { name: /Leave the project/i })).toBeVisible();
    await expect(page.getByText(/fully labelled synthetic data/i)).toBeVisible();

    await page.getByRole("link", { name: "Enter the synthetic demo" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Knowledge command centre" })).toBeVisible();
    await expect(page.getByText("Synthetic demo environment.")).toBeVisible();
  });

  test("dashboard shows the fixed readiness rubric with reasons", async ({ page }) => {
    await openWorkspace(page, "/dashboard");
    const panel = page.locator(".readiness-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("RUBRIC 25/25/15/15/10/10")).toBeVisible();
    await expect(panel.getByText("/100")).toBeVisible();
    for (const label of [
      "Evidence coverage",
      "Review completion",
      "Ownership coverage",
      "Conflict resolution",
      "Critical next actions",
      "Acknowledgement",
    ]) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(panel.getByText(/of \d+ accessible claims have exact, chunk-bound evidence/i)).toBeVisible();
  });

  test("navigation reaches every workspace section", async ({ page }) => {
    await openWorkspace(page, "/dashboard");
    for (const [href, heading] of [
      ["/sources", "Sources"],
      ["/knowledge", "Knowledge base"],
      ["/review", "Review centre"],
      ["/timeline", "Timeline and impact"],
      ["/handovers", "Handover studio"],
      ["/settings", "Workspace settings"],
    ] as const) {
      await page.locator(`aside.sidebar a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    }
  });

  test("role preview filters finance material and removes review authority", async ({ page }) => {
    await openWorkspace(page, "/knowledge");
    await expect(page.getByText("Synthetic sponsor commitment")).toBeVisible();

    await page.getByLabel("Preview role").selectOption("incoming");
    await expect(page.locator(".topbar-actions .pill").first()).toHaveText("Incoming owner");

    await openWorkspace(page, "/knowledge");
    await expect(page.getByText("Synthetic sponsor commitment")).toHaveCount(0);
    await expect(page.getByText(/accessible claims · \d+ excluded\s+by role/i).first()).toBeVisible();

    await openWorkspace(page, "/review");
    await expect(
      page.getByText("This role can read permitted findings but cannot approve them."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await openWorkspace(page, "/sources");
    await expect(page.getByText("Sponsor commitment · restricted note")).toHaveCount(0);
    await expect(page.getByText(/cannot add new material/i)).toBeVisible();
  });

  test("Ask the Buddy cites exact evidence and refuses unsupported questions", async ({ page }) => {
    await openWorkspace(page, "/handovers");
    const buddy = page.locator(".panel").filter({ hasText: "Ask the Buddy" }).first();
    const question = buddy.getByLabel("Question about this project");

    await question.fill("Which deployment target is current?");
    await buddy.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(buddy.getByText("Deployment target: Vercel.").first()).toBeVisible();
    await expect(buddy.getByText(/chunk /).first()).toBeVisible();
    await expect(buddy.getByText(/Answers are limited to recorded project knowledge/i)).toBeVisible();

    await question.fill("What is the cafeteria menu on Friday?");
    await buddy.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(
      buddy.getByText(/I do not have an evidence-backed answer to that question/i),
    ).toBeVisible();
    await expect(buddy.getByText("No citation was available for this answer.")).toBeVisible();
  });

  test("gap questions can be generated and an interview answer becomes a source", async ({ page }) => {
    await openWorkspace(page, "/timeline");
    await page.getByRole("button", { name: "Generate gap questions" }).click();
    await expect(
      page.getByText(/focused question\(s\) generated|No new gap questions were found/i),
    ).toBeVisible();

    const deployRow = page
      .locator(".activity-row")
      .filter({ hasText: "Which deployment target is current: Vercel or Netlify" })
      .first();
    await expect(deployRow).toBeVisible();
    const deployBox = deployRow.locator("xpath=..");
    await deployBox.getByLabel("Recorded answer").fill(
      "Meera confirmed Netlify is current for the pilot; the reason was not recorded.",
    );
    await deployBox.getByRole("button", { name: "Save as source" }).click();
    await expect(
      page.getByText(/Recorded by Meera Shah \(project lead\)/i).first(),
    ).toBeVisible();

    await openWorkspace(page, "/sources");
    await expect(page.getByText(/Interview answer recorded: Which deployment target/i)).toBeVisible();
  });

  test("timeline shows bounded impact traversal, not exhaustive consequences", async ({ page }) => {
    await openWorkspace(page, "/timeline");
    await expect(page.getByRole("heading", { name: "Timeline and impact" })).toBeVisible();
    await expect(
      page.getByText(/not every possible real-world consequence/i).first(),
    ).toBeVisible();
    await expect(page.getByText("Impact explorer")).toBeVisible();
    await expect(page.getByText("MAX DEPTH 3")).toBeVisible();
    await expect(page.getByText("hop 1").first()).toBeVisible();

    await openWorkspace(page, "/knowledge?q=deployment");
    const card = page.locator(".claim-card").first();
    await expect(card.getByText("Potentially affected through recorded relationships")).toBeVisible();
    await expect(
      card.getByText(/This is a bounded graph traversal, not a claim that every real-world consequence has been found./i),
    ).toBeVisible();
  });
});
