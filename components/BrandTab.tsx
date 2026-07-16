"use client";

import { useStore } from "./store";
import { BRAND_SECTIONS, hasBrandValue, type BrandAnswers, type BrandColor, type BrandLink, type BrandQuestion } from "@/lib/brand";
import type { Client } from "@/lib/data";

// Табът „Бранд" в детайлите на клиент — визуализира попълнения бранд
// въпросник, за да може екипът да спазва цветовете/тона/правилата на клиента.
// Пълни се през модала (kind: "brand") — ръчно или с импорт на .docx.

function Answer({ q, value }: { q: BrandQuestion; value: BrandAnswers[string] | undefined }) {
  if (!hasBrandValue(value)) return <span className="bm-text-subtle">—</span>;
  if (q.type === "colors") {
    return (
      <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
        {(value as BrandColor[]).map((c, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--bm-border)", borderRadius: "var(--bm-radius-md)", padding: "3px 8px 3px 4px" }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: c.hex, border: "1px solid var(--bm-border)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--bm-font-mono)", fontSize: "var(--bm-text-xs)" }}>{c.hex}</span>
            {c.name && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{c.name}</span>}
          </span>
        ))}
      </div>
    );
  }
  if (q.type === "tags") {
    return (
      <div style={{ display: "flex", gap: "var(--bm-space-2)", flexWrap: "wrap" }}>
        {(value as string[]).map((t, i) => <span key={i} className="bm-badge bm-badge--brand">{t}</span>)}
      </div>
    );
  }
  if (q.type === "links") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {(value as BrandLink[]).map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ color: "var(--bm-primary)", fontSize: "var(--bm-text-sm)", wordBreak: "break-all" }}>
            {l.label || l.url}
          </a>
        ))}
      </div>
    );
  }
  return <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{value as string}</p>;
}

export function BrandTab({ client }: { client: Client }) {
  const { brandProfiles, currentUser, openModal } = useStore();
  const profile = brandProfiles.find((p) => p.client_id === client.id);
  const answers: BrandAnswers = profile?.answers || {};
  const canEdit = currentUser.level === "admin" || currentUser.level === "manager";
  const filled = Object.values(answers).filter((v) => hasBrandValue(v)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {profile ? (
            <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>
              Попълнени {filled} въпроса · обновено {new Date(profile.updated_at).toLocaleDateString("bg-BG")}
            </span>
          ) : (
            <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>Бранд профилът още не е попълнен.</span>
          )}
        </div>
        <a href="/brand-questionnaire.docx" download className="bm-btn bm-btn--secondary bm-btn--sm">Свали шаблона (.docx)</a>
        {canEdit && (
          <button className="bm-btn bm-btn--primary bm-btn--sm" onClick={() => openModal({ kind: "brand", clientId: client.id })}>
            {profile ? "Редакция / Импорт" : "Попълни / Импорт"}
          </button>
        )}
      </div>

      {!profile && (
        <div className="bm-alert bm-alert--info">
          Изпратете шаблона на клиента след onboarding срещата. Когато го върне попълнен, качете го с „Попълни / Импорт“ — системата разчита отговорите и ги разпределя тук.
          {(client.brand_voice || client.target_audience) && " По-долу са показани наличните стари бранд бележки от картата на клиента."}
        </div>
      )}

      {!profile && (client.brand_voice || client.target_audience || client.brand_assets_url) && (
        <div className="bm-card">
          <div className="bm-card__header"><h3>Стари бранд бележки</h3></div>
          <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-3)", fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}>
            {client.brand_voice && <div><div style={{ fontWeight: 600, color: "var(--bm-text)" }}>Тон на гласа</div><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{client.brand_voice}</p></div>}
            {client.target_audience && <div><div style={{ fontWeight: 600, color: "var(--bm-text)" }}>Аудитория</div><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{client.target_audience}</p></div>}
            {client.brand_assets_url && <div><div style={{ fontWeight: 600, color: "var(--bm-text)" }}>Материали</div><a href={client.brand_assets_url} target="_blank" rel="noreferrer" style={{ color: "var(--bm-primary)" }}>{client.brand_assets_url}</a></div>}
          </div>
        </div>
      )}

      {profile && <BrandSectionsView answers={answers} />}
    </div>
  );
}

// Read-only визуализация на попълнения въпросник — ползва се от таба „Бранд"
// (админ) и от модала brandView, през който работниците я гледат от Продукция.
export function BrandSectionsView({ answers }: { answers: BrandAnswers }) {
  return (
    <>
      {BRAND_SECTIONS.map((section) => {
        const sectionFilled = section.questions.some((q) => hasBrandValue(answers[q.key]));
        return (
          <div key={section.key} className="bm-card">
            <div className="bm-card__header"><h3>{section.title}</h3></div>
            <div className="bm-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-4)", fontSize: "var(--bm-text-sm)", color: "var(--bm-text-muted)" }}>
              {!sectionFilled && <span className="bm-text-subtle">Няма попълнени отговори в тази секция.</span>}
              {sectionFilled && section.questions.map((q) => (
                <div key={q.key}>
                  <div style={{ fontWeight: 600, color: "var(--bm-text)", marginBottom: 4 }}>{q.label}</div>
                  <Answer q={q} value={answers[q.key]} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
