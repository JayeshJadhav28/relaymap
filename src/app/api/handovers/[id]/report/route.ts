import { NextResponse } from "next/server";
import { generateHandoverHtml } from "@/lib/handover/report-generator";
import { getHandoverView } from "@/lib/demo/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const view = await getHandoverView(id);

  if (!view) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Handover not found or not visible to this role.",
          requestId: crypto.randomUUID(),
        },
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Only the published snapshot may leave the system. A draft must never be
  // exported as if it were the agreed handover.
  const version = view.handover.currentVersionId
    ? view.handover.versions.find((item) => item.id === view.handover.currentVersionId)
    : undefined;

  if (!version || !version.publishedAt) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_PUBLISHED",
          message: "Only a published handover version can be exported. Publish the current draft first.",
          requestId: crypto.randomUUID(),
        },
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const html = generateHandoverHtml({
    project: view.project,
    handover: view.handover,
    version,
    generatedAt: new Date().toISOString(),
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="relaymap-handover-${view.handover.id}-v${version.version}.html"`,
    },
  });
}
