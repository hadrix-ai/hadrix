import { PRESS_KIT_UPLOAD_CONFIG } from "../../config/press-kit.config";
import { PRESS_KIT_COPY, PRESS_KIT_METADATA } from "../../constants/press-kit.constants";

export const metadata = PRESS_KIT_METADATA;

export default function PressKitUploaderPage() {
  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>{PRESS_KIT_COPY.heading}</h1>
      <p>
        {PRESS_KIT_COPY.intro} <code>{PRESS_KIT_UPLOAD_CONFIG.publicPathHint}</code>{" "}
        for the press kit page.
      </p>
      {/* TODO: Show a lightweight preview grid after upload so marketing can verify assets. */}
      {/* TODO: Replace inline styles with a shared press-kit layout once the design tokens land. */}
      <form
        action={PRESS_KIT_UPLOAD_CONFIG.endpoint}
        method="post"
        encType="multipart/form-data"
        style={{ display: "grid", gap: 12, marginTop: 24 }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          {PRESS_KIT_COPY.fileLabel}
          <input type="file" name={PRESS_KIT_UPLOAD_CONFIG.fileFieldName} required />
        </label>
        <button type="submit">{PRESS_KIT_COPY.submitLabel}</button>
      </form>
    </main>
  );
}
