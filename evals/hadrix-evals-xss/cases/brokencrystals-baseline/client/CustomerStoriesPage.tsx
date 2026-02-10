import { CUSTOMER_STORIES_COPY } from "./constants/customerStoriesCopy";
import { FEATURED_TESTIMONIALS } from "./mock/featuredTestimonials";
import { TestimonialCard } from "./TestimonialCard";

export function CustomerStoriesPage() {
  return (
    <section>
      <header>
        <h2>{CUSTOMER_STORIES_COPY.heading}</h2>
        <p>{CUSTOMER_STORIES_COPY.subheading}</p>
      </header>
      {/* TODO: Add pagination when the featured list gets long. */}
      <div>
        {FEATURED_TESTIMONIALS.map((testimonial) => (
          <TestimonialCard
            key={`${testimonial.author}-${testimonial.bodyHtml.length}`}
            testimonial={testimonial}
          />
        ))}
      </div>
    </section>
  );
}
