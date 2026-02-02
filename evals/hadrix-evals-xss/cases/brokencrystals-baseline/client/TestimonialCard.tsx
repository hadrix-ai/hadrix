type Testimonial = {
  author: string;
  bodyHtml: string;
};

export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <article>
      <h3>{testimonial.author}</h3>
      <div dangerouslySetInnerHTML={{ __html: testimonial.bodyHtml }} />
    </article>
  );
}
