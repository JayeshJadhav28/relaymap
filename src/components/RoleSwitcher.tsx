"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/demo/types";
import { ROLE_LABEL } from "@/lib/presentation";
import { postJson } from "@/lib/client/api";

const ROLES: Role[] = ["lead", "reviewer", "treasurer", "incoming"];

export function RoleSwitcher({ role }: { role: Role }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(nextRole: string) {
    setBusy(true);
    const result = await postJson("/api/role", { role: nextRole });
    setBusy(false);
    if (result.ok) router.refresh();
  }

  return (
    <label className="role-switcher">
      <span>Preview role</span>
      <select
        value={role}
        disabled={busy}
        onChange={(event) => void change(event.target.value)}
        aria-label="Preview role"
      >
        {ROLES.map((item) => (
          <option key={item} value={item}>
            {ROLE_LABEL[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
