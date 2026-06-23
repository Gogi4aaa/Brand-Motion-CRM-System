"use client";

import { useStore } from "@/components/store";
import { PRODUCTION_ROLES, ROLE_LABELS, type AccessRole } from "@/lib/data";

const ROLE_HELP: Record<AccessRole, string> = {
  admin: "Пълен достъп до всичко, вкл. фактури и анализи.",
  manager: "Клиенти, продукция, кампании, анализи — без фактури и този екран за роли.",
  worker: "Само своите задачи, съдържание и продукция за зачислените клиенти. Без финанси.",
};

export default function TeamPage() {
  const { team, tasks, usingMock, currentUser, updateMemberRole, updateMemberRoles } = useStore();

  const toggleRole = (memberId: string, roles: string[], roleId: string) => {
    const next = roles.includes(roleId) ? roles.filter((r) => r !== roleId) : [...roles, roleId];
    updateMemberRoles(memberId, next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-5)" }}>
      <div>
        <h1>Екип и достъп</h1>
        <p className="bm-text-muted" style={{ margin: "4px 0 0" }}>
          {team.length} {team.length === 1 ? "член" : "членове"}{usingMock ? " · демо данни" : ""}. Новите потребители влизат като „Сътрудник“, докато не им смениш ролята.
        </p>
      </div>

      {currentUser.isAdmin && (
        <div className="bm-alert bm-alert--info" style={{ display: "flex", flexDirection: "column", gap: "var(--bm-space-1)" }}>
          <div style={{ fontSize: "var(--bm-text-sm)" }}>• <b>Администратор</b> — {ROLE_HELP.admin}</div>
          <div style={{ fontSize: "var(--bm-text-sm)" }}>• <b>Мениджър</b> — {ROLE_HELP.manager}</div>
          <div style={{ fontSize: "var(--bm-text-sm)" }}>• <b>Сътрудник</b> — {ROLE_HELP.worker}</div>
        </div>
      )}

      <div className="bm-table-wrap">
        <table className="bm-table">
          <thead><tr><th>Член</th><th>Ниво на достъп</th><th>Роли в продукция</th><th className="bm-table__num">Отворени задачи</th></tr></thead>
          <tbody>
            {team.map((m) => {
              const open = tasks.filter((t) => t.assignee === m.initials && t.status !== "done").length;
              const isMe = m.initials === currentUser.initials;
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--bm-space-3)" }}>
                      <span className="bm-avatar bm-avatar--sm">{m.initials}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{m.name} {isMe && <span className="bm-text-subtle" style={{ fontWeight: 400 }}>(вие)</span>}</div>
                        <div className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>{m.initials}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {currentUser.isAdmin ? (
                      <select className="bm-select" style={{ width: "auto", minWidth: 140 }} value={m.role} disabled={isMe} title={isMe ? "Не можеш да смениш своята роля" : ""} onChange={(e) => updateMemberRole(m.id, e.target.value as AccessRole)}>
                        <option value="admin">{ROLE_LABELS.admin}</option>
                        <option value="manager">{ROLE_LABELS.manager}</option>
                        <option value="worker">{ROLE_LABELS.worker}</option>
                      </select>
                    ) : (
                      <span className={"bm-badge " + (m.role === "admin" ? "bm-badge--brand" : m.role === "manager" ? "bm-badge--info" : "bm-badge--neutral")}>{ROLE_LABELS[m.role]}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {PRODUCTION_ROLES.map((r) => {
                        const on = (m.roles || []).includes(r.id);
                        if (!currentUser.isAdmin) return on ? <span key={r.id} className="bm-badge bm-badge--brand">{r.label}</span> : null;
                        return (
                          <button key={r.id} onClick={() => toggleRole(m.id, m.roles || [], r.id)} className={"bm-badge " + (on ? "bm-badge--brand" : "bm-badge--neutral")} style={{ cursor: "pointer", border: "none" }}>{r.label}</button>
                        );
                      })}
                      {!currentUser.isAdmin && (m.roles || []).length === 0 && <span className="bm-text-subtle" style={{ fontSize: "var(--bm-text-xs)" }}>—</span>}
                    </div>
                  </td>
                  <td className="bm-table__num">{open}</td>
                </tr>
              );
            })}
            {team.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--bm-text-subtle)", padding: "var(--bm-space-8)" }}>Все още няма членове.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
