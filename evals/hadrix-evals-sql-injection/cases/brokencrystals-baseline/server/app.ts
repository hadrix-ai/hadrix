import express, { type Express } from "express";
import { countTestimonials } from "./routes/testimonials.js";

const TESTIMONIAL_PULSE_ROUTES = {
  count: "/marketing/testimonials/pulse",
};

export function buildTestimonialPulseApp(): Express {
  const app = express();

  // TODO: add a lightweight pulse health check once marketing wants uptime pings.
  app.get(TESTIMONIAL_PULSE_ROUTES.count, countTestimonials);

  return app;
}
