"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "./store";
import { canAccess, sectionForPath } from "@/lib/data";

export function AccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, loading } = useStore();
  const allowed = canAccess(currentUser.level, sectionForPath(pathname));

  useEffect(() => {
    if (!loading && !allowed) router.replace("/dashboard");
  }, [loading, allowed, router]);

  if (!loading && !allowed) {
    return (
      <div className="bm-card"><div className="bm-card__body bm-text-subtle">
        Нямате достъп до тази секция.
      </div></div>
    );
  }
  return <>{children}</>;
}
