import { AlertsBridge } from "../components/AlertsBridge";

export default function AlertsBridgePage() {
  return (
    <main>
      <header>
        <p>NOC console</p>
        <h1>Alerts bridge</h1>
      </header>
      <section>
        <p>Send a quick test message to keep the alert channel warm.</p>
      </section>
      <AlertsBridge />
    </main>
  );
}
