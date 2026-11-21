import type { MockHassController } from "../mock/mock-hass";

const ROLES = [
  { admin: false, label: "User view" },
  { admin: true, label: "Admin view" },
];

// One click to see the UI as a regular user or as an admin (switches the mock's current user).
export function RoleSwitch({ controller }: { controller: MockHassController }) {
  const { state } = controller;
  const current = state.persons.find((p) => p.userId === state.currentUserId);
  return (
    <span className="row">
      {ROLES.map((r) => {
        const person = state.persons.find((p) => p.isAdmin === r.admin);
        return (
          <button
            key={r.label}
            className={current?.isAdmin === r.admin ? "on" : ""}
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
