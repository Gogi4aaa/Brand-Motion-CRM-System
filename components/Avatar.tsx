"use client";

// Аватар на член от екипа: показва профилната снимка, ако има качена, иначе
// инициалите (стария вид). Снимката се резолва по инициали от екипа в store-а,
// затова call site-овете подават само инициалите — както досега.

import { useStore } from "@/components/store";

export function Avatar({
  initials,
  size = "sm",
  className = "",
  style,
  title,
}: {
  initials: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const { team } = useStore();
  const url = team.find((m) => m.initials === initials)?.avatar_url;
  const sizeCls = size === "lg" ? "bm-avatar--lg" : size === "sm" ? "bm-avatar--sm" : "";
  const cls = ["bm-avatar", sizeCls, className].filter(Boolean).join(" ");
  return (
    <span className={cls} style={style} title={title}>
      {/* Малка аватарка от Storage — next/image е излишен (и иска домейн конфиг). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={initials} /> : initials}
    </span>
  );
}
