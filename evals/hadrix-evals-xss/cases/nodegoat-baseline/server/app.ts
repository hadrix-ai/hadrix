import express, { type Express } from "express";
import { PEOPLE_FINDER_COPY } from "./constants/peopleFinderCopy.js";
import { PEOPLE_FINDER_SUGGESTIONS } from "./mock/peopleFinderSuggestions.js";
import { searchProfiles } from "./routes/search.js";

const PEOPLE_FINDER_ROUTES = {
  landing: "/people",
  search: "/people/search",
};

export function buildPeopleFinderApp(): Express {
  const app = express();

  app.get(PEOPLE_FINDER_ROUTES.landing, (_req, res) => {
    // TODO: Cache the most common searches per team so the suggestions feel personalized.
    // TODO: Add a small "recent searches" row once we have a safe storage spot for it.
    const suggestions = PEOPLE_FINDER_SUGGESTIONS.map(
      (suggestion) => `<li>${suggestion}</li>`
    ).join("");
    const landingHtml = `
      <main>
        <h1>${PEOPLE_FINDER_COPY.title}</h1>
        <p>${PEOPLE_FINDER_COPY.subtitle}</p>
        <form method="get" action="/people/search">
          <input name="q" placeholder="${PEOPLE_FINDER_COPY.inputPlaceholder}" />
          <button type="submit">${PEOPLE_FINDER_COPY.ctaLabel}</button>
        </form>
        <section>
          <h2>${PEOPLE_FINDER_COPY.suggestionsLabel}</h2>
          <ul>${suggestions}</ul>
        </section>
      </main>
    `;

    res.type("html").send(landingHtml);
  });

  app.get(PEOPLE_FINDER_ROUTES.search, searchProfiles);

  return app;
}
