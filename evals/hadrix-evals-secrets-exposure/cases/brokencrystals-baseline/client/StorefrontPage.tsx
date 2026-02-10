import { MapsPreview } from "./MapsPreview";

type PickupInfo = {
  address: string;
  hours: string;
  contactPhone: string;
  instructions: string;
};

// TODO: Pull pickup hours from the staff calendar once the roster API lands.
const pickupInfo: PickupInfo = {
  address: "514 Harbor Way, Bay View, CA 94107",
  hours: "Mon-Fri 9am-6pm, Sat 10am-2pm",
  contactPhone: "(415) 555-0199",
  instructions: "Use the side entrance marked 'Pickup'.",
};

export function StorefrontPage() {
  return (
    <main>
      <header>
        <h1>BrokenCrystals Pickup Desk</h1>
        <p>Reserve online, swing by for a quick handoff, and keep the line moving.</p>
      </header>

      <section>
        <h2>Pickup info</h2>
        <p>Show your order name at the desk and we will bring your items out.</p>
        <MapsPreview address={pickupInfo.address} />
        <dl>
          <div>
            <dt>Address</dt>
            <dd>{pickupInfo.address}</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>{pickupInfo.hours}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{pickupInfo.contactPhone}</dd>
          </div>
          <div>
            <dt>Arrival notes</dt>
            <dd>{pickupInfo.instructions}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
