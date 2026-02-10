import express, { type Express } from "express";
import { MESSAGE_PREVIEW_COPY } from "./constants/messagePreviewCopy.js";
import { MESSAGE_PREVIEW_ROUTES } from "./constants/messagePreviewRoutes.js";
import { MESSAGE_PREVIEW_SNIPPETS } from "./mock/messagePreviewSnippets.js";
import { previewMessage } from "./routes/preview.js";

export function buildMessagePreviewApp(): Express {
  const app = express();

  app.get(MESSAGE_PREVIEW_ROUTES.composer, (_req, res) => {
    // TODO: Persist draft content between refreshes for the composer view.
    // TODO: Add a lightweight "last previewed" stamp in the UI header.
    const snippets = MESSAGE_PREVIEW_SNIPPETS.map(
      (snippet) => `<li>${snippet}</li>`
    ).join("");
    const composerHtml = `
      <main>
        <h1>${MESSAGE_PREVIEW_COPY.title}</h1>
        <p>${MESSAGE_PREVIEW_COPY.subtitle}</p>
        <form method="get" action="${MESSAGE_PREVIEW_ROUTES.preview}">
          <label for="message">${MESSAGE_PREVIEW_COPY.inputLabel}</label>
          <textarea
            id="message"
            name="message"
            rows="6"
            placeholder="${MESSAGE_PREVIEW_COPY.inputPlaceholder}"
          ></textarea>
          <button type="submit">${MESSAGE_PREVIEW_COPY.previewCta}</button>
        </form>
        <section>
          <h2>${MESSAGE_PREVIEW_COPY.tipsLabel}</h2>
          <ul>${snippets}</ul>
        </section>
      </main>
    `;

    res.type("html").send(composerHtml);
  });

  app.get(MESSAGE_PREVIEW_ROUTES.preview, previewMessage);

  return app;
}
