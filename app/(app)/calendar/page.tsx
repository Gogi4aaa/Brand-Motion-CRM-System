"use client";

// Календарът живее в „Продукция“ (под дъската) — тази страница остава като
// тънка обвивка за стари линкове/отметки (?client= deep links included).

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ContentCalendar } from "@/components/ContentCalendar";

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarInner />
    </Suspense>
  );
}

function CalendarInner() {
  const search = useSearchParams();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div>
        <h1>Календар със съдържание</h1>
        <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>Планирай постове, рийлс и промо по клиенти. Календарът е и в „Продукция“, под дъската.</p>
      </div>
      <ContentCalendar initialClientId={search.get("client") || undefined} />
    </div>
  );
}
