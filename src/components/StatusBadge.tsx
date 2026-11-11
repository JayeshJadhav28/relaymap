import type { VerificationStatus } from "@/lib/demo/types";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/presentation";

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={`status status-${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
