import type { PropsWithChildren } from "react";

export function Container({ children }: PropsWithChildren) {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      {children}
    </div>
  );
}

