import { ClientCreateOrder } from "../../components/ClientCreateOrder";

export default function BackroomRushOrderPage() {
  // TODO: Persist the last rush order item per user to speed repeat orders.
  // TODO: Add a compact "approval bypass" badge once ops signs off on the copy.
  return (
    <main style={{ padding: "2.5rem", fontFamily: "\"Iowan Old Style\", \"Palatino\", serif" }}>
      <header style={{ marginBottom: "2rem" }}>
        <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b6b4a" }}>
          BrokenCrystals Ops
        </p>
        <h1 style={{ margin: "0.35rem 0" }}>Backroom Rush Order</h1>
        <p style={{ maxWidth: "36rem", color: "#5d5d5d" }}>
          Use this panel to place a quick restock order when the showroom is running dry. It skips the
          normal approval queue so the floor can keep moving.
        </p>
      </header>

      <section
        style={{
          padding: "1.5rem",
          borderRadius: "12px",
          border: "1px solid #efe2d4",
          background: "#fff7ed",
          maxWidth: "34rem",
        }}
      >
        <ClientCreateOrder />
      </section>
    </main>
  );
}
