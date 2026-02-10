import { TestimonialDomainModel } from "./types/domain/testimonialDomainModel";

export function TestimonialCard({
  testimonial,
}: {
  testimonial: TestimonialDomainModel;
}) {
  return (
    <article>
      <h3>{testimonial.author}</h3>
      <div dangerouslySetInnerHTML={{ __html: testimonial.bodyHtml }} />
    </article>
  );
}
