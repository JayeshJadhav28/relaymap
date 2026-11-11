import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openWorkspace, resetDemo, useRole } from "./support";

const fixture = (name: string): Buffer =>
  readFileSync(path.join(process.cwd(), "src/lib/ingestion/__fixtures__", name));

async function chooseFile(
  page: import("@playwright/test").Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<void> {
  await page.getByLabel("Choose a file").setInputFiles({ name, mimeType, buffer });
  await page.getByRole("button", { name: "Ingest and extract" }).click();
}

test.describe("source ingestion through the browser", () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    await useRole(page, "lead");
    await openWorkspace(page, "/sources");
  });

  test("accepts TXT, Markdown, CSV and JSON and shows exact-offset chunks", async ({ page }) => {
    await chooseFile(
      page,
      "browser-note.txt",
      "text/plain",
      Buffer.from("Decision: pilot moves to Netlify.\nOwner: Unassigned."),
    );
    await expect(page.getByRole("status")).toContainText("browser-note.txt ingested");
    await expect(page.getByRole("status")).toContainText("Nothing was auto-approved");
    await expect(page.locator(".source-card").filter({ hasText: "browser-note.txt" })).toBeVisible();

    for (const [name, mime, body] of [
      ["browser-note.md", "text/markdown", "# Decision\n\nWe chose Netlify."],
      ["browser-tasks.csv", "text/csv", "id,title,assignee\nCC-90,Reconcile alerts,Unassigned"],
      ["browser-data.json", "application/json", '{"task":"Reconcile alerts","owner":"Aarav"}'],
    ] as const) {
      await chooseFile(page, name, mime, Buffer.from(body));
      await expect(page.getByRole("status")).toContainText(`${name} ingested`);
      await expect(page.locator(".source-card").filter({ hasText: name })).toBeVisible();
    }
  });

  test("rejects malformed JSON, unsupported extensions and oversized files", async ({ page }) => {
    const pasteBox = page.locator("details.paste-box");
    await pasteBox.locator("summary").click();
    await pasteBox.getByLabel("Filename").fill("broken.json");
    await pasteBox.getByLabel("Content").fill("{not valid json");
    await page.getByRole("button", { name: "Ingest and extract" }).click();
    await expect(page.getByRole("status")).toContainText("not valid JSON");

    await chooseFile(page, "payload.exe", "application/octet-stream", Buffer.from("MZ-not-a-source"));
    await expect(page.getByRole("status")).toContainText("Supported source formats");

    await page
      .getByLabel("Choose a file")
      .setInputFiles({
        name: "huge.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 97),
      });
    await page.getByRole("button", { name: "Ingest and extract" }).click();
    await expect(page.getByRole("status")).toContainText("up to 2 MB");
  });

  test("records real PDF page provenance", async ({ page }) => {
    await chooseFile(page, "sample.pdf", "application/pdf", fixture("sample.pdf"));
    await expect(page.getByRole("status")).toContainText("sample.pdf ingested");
    await expect(page.locator(".source-card").filter({ hasText: "sample.pdf" })).toBeVisible();

    await openWorkspace(page, "/knowledge?q=deployment");
    const card = page
      .locator(".claim-card")
      .filter({ hasText: "Deployment target recorded as vercel" })
      .first();
    await expect(card).toBeVisible();
    await expect(card.locator("blockquote").first()).toContainText("Deployment target: Vercel.");
    await expect(card.getByText("sample.pdf · Page 1", { exact: false })).toBeVisible();
    await expect(card.getByText(/chunk chunk-/).first()).toBeVisible();
  });

  test("parses DOCX without inventing page numbers", async ({ page }) => {
    await chooseFile(
      page,
      "notes.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fixture("sample.docx"),
    );
    await expect(page.getByRole("status")).toContainText("notes.docx ingested");

    await openWorkspace(page, "/knowledge?q=staging");
    const card = page.locator(".claim-card").first();
    await expect(card.locator("blockquote").first()).toContainText("staging credentials expired");
    await expect(card.getByText("notes.docx · Document", { exact: false })).toBeVisible();
    await expect(card.getByText(/Page \d/)).toHaveCount(0);
  });

  test("rejects a file whose signature does not match its extension", async ({ page }) => {
    await chooseFile(page, "disguised.pdf", "application/pdf", fixture("sample.docx"));
    await expect(page.getByRole("status")).toContainText(
      "The file signature does not match the .pdf extension.",
    );
    await expect(page.locator(".source-card").filter({ hasText: "disguised.pdf" })).toHaveCount(0);
  });

  test("rejects a plain zip renamed to .docx", async ({ page }) => {
    await chooseFile(
      page,
      "archive.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fixture("plain-archive.docx"),
    );
    await expect(page.getByRole("status")).toContainText("file signature does not match");
  });

  test("enforces upload and finance-scope permissions outside the UI", async ({ page }) => {
    await useRole(page, "incoming");
    const denied = await page.request.post("/api/sources", {
      data: { filename: "incoming.txt", content: "Deployment target: Vercel." },
    });
    expect(denied.status()).toBe(403);

    await useRole(page, "reviewer");
    const finance = await page.request.post("/api/sources", {
      data: { filename: "reviewer-finance.txt", content: "Budget: 40000 INR.", access: "finance" },
    });
    expect(finance.status()).toBe(403);

    await useRole(page, "lead");
    const allowed = await page.request.post("/api/sources", {
      data: { filename: "lead-finance.txt", content: "Budget: 40000 INR.", access: "finance" },
    });
    expect(allowed.status()).toBe(201);
  });
});
