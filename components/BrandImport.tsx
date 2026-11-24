"use client";

// Импорт на бранд профил: пускаш файл (.docx / .md / .txt / .json) или
// поставяш текст — полетата се разпределят сами. Ползва се в прозореца
// „Бранд профил“ и в съветника за нов клиент. Нищо не записва само:
// връща разчетеното през onParsed, записва извикващият.

import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { BRAND_QUESTIONS, brandAiPrompt, brandFileTemplate, brandLabel, type BrandAnswers, type BrandColor } from "@/lib/brand";

export interface BrandImportData { answers: BrandAnswers; missing: number[]; mode?: string }

const ACCEPT = ".docx,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/json";

// Кратко обобщение на разчетеното: цветовете като мостри + кои полета са намерени.
export function BrandImportSummary({ data }: { data: BrandImportData }) {
  const colors = [...((data.answers.primary_colors as BrandColor[] | undefined) || []), ...((data.answers.accent_colors as BrandColor[] | undefined) || [])];
  const found = BRAND_QUESTIONS.filter((q) => q.key in data.answers);
  const missing = BRAND_QUESTIONS.filter((q) => !(q.key in data.answers));
  return (
    <div className="bi-summary" role="status">
      <div className="bi-summary__head">
        <b>Разчетени {found.length} от {BRAND_QUESTIONS.length} полета</b>
        {colors.length > 0 && (
          <span className="bi-swatches" aria-label={`Цветове: ${colors.map((c) => c.hex).join(", ")}`}>
            {colors.map((c, i) => <i key={i} style={{ background: c.hex }} title={c.hex + (c.name ? ` — ${c.name}` : "")} />)}
          </span>
        )}
      </div>
      <div className="bi-chips">
        {found.map((q) => <span key={q.key} className="bm-badge bm-badge--success">{brandLabel(q.key)}</span>)}
        {missing.map((q) => <span key={q.key} className="bm-badge bm-badge--neutral" title="Няма го във файла — може да се попълни ръчно">{brandLabel(q.key)}</span>)}
      </div>
    </div>
  );
}

export function BrandImportBox({ clientName, onParsed, compact = false }: { clientName?: string; onParsed: (d: BrandImportData) => void; compact?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastName, setLastName] = useState("");

  const send = async (fd: FormData, label: string) => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/import/brand", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Не успях да разчета това."); return; }
      setLastName(label);
      onParsed({ answers: data.answers as BrandAnswers, missing: (data.missing || []) as number[], mode: data.mode });
    } catch {
      setError("Връзката прекъсна — опитай пак.");
    } finally {
      setBusy(false);
    }
  };
  const sendFile = (f: File | null | undefined) => { if (!f) return; const fd = new FormData(); fd.append("file", f); send(fd, f.name); };
  const sendText = () => { if (!text.trim()) { setError("Постави текста на бранд профила."); return; } const fd = new FormData(); fd.append("text", text); send(fd, "поставен текст"); };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(brandAiPrompt(clientName)); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError("Копирането е блокирано от браузъра — маркирай текста ръчно."); setHelp(true); }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([brandFileTemplate()], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "brand-profile.md"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bi-box">
      <div
        className={"bi-drop" + (over ? " bi-drop--over" : "") + (compact ? " bi-drop--compact" : "")}
        role="button" tabIndex={0} aria-label="Качи бранд файл"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); sendFile(e.dataTransfer.files?.[0]); }}
      >
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { sendFile(e.target.files?.[0]); e.target.value = ""; }} />
        <span className="bi-drop__icon" aria-hidden="true"><Icon name="plus" size={18} /></span>
        <span>
          <b>{busy ? "Разчитам…" : lastName ? `Разчетено: ${lastName} — пусни друг файл, за да го смениш` : "Пусни бранд файла тук или цъкни, за да избереш"}</b>
          <small>.docx, .md, .txt или .json · цветовете, шрифтовете, тонът и останалото се разпределят сами</small>
        </span>
      </div>

      <div className="bi-actions">
        <button type="button" className="bm-btn bm-btn--ghost bm-btn--sm" aria-expanded={paste} onClick={() => setPaste((v) => !v)}>{paste ? "Скрий текста" : "Постави текст вместо файл"}</button>
        <button type="button" className="bm-btn bm-btn--ghost bm-btn--sm" onClick={copyPrompt}>{copied ? "✓ Копирано — дай го на AI" : "Копирай инструкция за AI"}</button>
        <button type="button" className="bm-btn bm-btn--ghost bm-btn--sm" aria-expanded={help} onClick={() => setHelp((v) => !v)}>Как изглежда файлът?</button>
      </div>

      {paste && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-2)" }}>
          <textarea className="bm-textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Основни цветове: #0090B5 (основен син), #111827 (тъмен текст)\nШрифтове: Montserrat\nТон на гласа: приятелски, като съсед, който разбира от темата\n…"} />
          <button type="button" className="bm-btn bm-btn--secondary bm-btn--sm" style={{ alignSelf: "flex-start" }} onClick={sendText} disabled={busy}>{busy ? "Разчитам…" : "Разчети текста"}</button>
        </div>
      )}

      {help && (
        <div className="bi-help">
          <p>Всяко поле започва с етикет и двоеточие, на нов ред. Редът и празните полета нямат значение, а заглавията (## …) са по желание. Най-лесно: цъкни „Копирай инструкция за AI“, дай я на Claude или ChatGPT заедно със сайта и материалите на клиента и качи отговора тук.</p>
          <pre>{brandFileTemplate()}</pre>
          <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
            <button type="button" className="bm-btn bm-btn--secondary bm-btn--sm" onClick={downloadTemplate}>Свали празен файл (.md)</button>
            <a href="/brand-questionnaire.docx" download className="bm-btn bm-btn--ghost bm-btn--sm">Въпросник за клиента (.docx)</a>
          </div>
        </div>
      )}

      {error && <div className="bm-alert bm-alert--danger" role="alert">{error}</div>}
    </div>
  );
}
