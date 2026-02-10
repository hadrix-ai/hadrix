import type { ReactNode } from "react";

import { backroomRushCopy } from "../../constants/backroomRushCopy";

export default function BackroomRushLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 280px) 1fr",
        gap: "2rem",
        alignItems: "start",
      }}
    >
      <aside
        style={{
          padding: "1.5rem",
          borderRadius: "12px",
          background: "#f4efe7",
          border: "1px solid #efe2d4",
          color: "#5b4b3a",
          fontFamily: "\"Iowan Old Style\", \"Palatino\", serif",
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontSize: "0.75rem",
            margin: 0,
            color: "#8b6b4a",
          }}
        >
          {backroomRushCopy.panelLabel}
        </p>
        <h2 style={{ margin: "0.6rem 0 0.35rem" }}>{backroomRushCopy.panelTitle}</h2>
        <p style={{ margin: "0 0 0.75rem", color: "#6a5b4c" }}>
          {backroomRushCopy.panelIntro}
        </p>
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {backroomRushCopy.shiftNotes.map((note) => (
            <li key={note} style={{ marginBottom: "0.5rem" }}>
              {note}
            </li>
          ))}
        </ul>
      </aside>
      {children}
    </div>
  );
}
