import { spaceRole } from "ha-share-space-ui/ha";
import type { SharePrefs, SpaceRole } from "ha-share-space-ui/ha";
import type { MockHassController } from "../mock/mock-hass";

const ROLES: Array<{ role: SpaceRole; label: string }> = [
  { role: "user", label: "User view" },
  { role: "space_admin", label: "Space admin view" },
  { role: "technical_admin", label: "Technical admin view" },
];

const roleOf = (p: { isAdmin: boolean; userData?: Record<string, unknown> }): SpaceRole =>
  spaceRole({ user: { id: "", name: "", is_admin: p.isAdmin } } as never, p.userData?.share_space as SharePrefs | undefined);

// One click to see the UI as a user, a space admin or a technical admin (switches the mock's current user).
export function RoleSwitch({ controller }: { controller: MockHassController }) {
  const { state } = controller;
  const current = state.persons.find((p) => p.userId === state.currentUserId);
  return (
    <span className="row">
      {ROLES.map((r) => {
        const person = state.persons.find((p) => roleOf(p) === r.role);
        return (
          <button
            key={r.label}
            className={current && roleOf(current) === r.role ? "on" : ""}
            disabled={!person}
            onClick={() => person && controller.setUser(person.userId)}
          >
            {r.label}
            {person ? ` (${person.name})` : ""}
          </button>
        );
      })}
    </span>
  );
}
