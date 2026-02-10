import { SEED_LIBRARY_COPY } from "./config/seedLibraryCopy";
import {
  SEED_LIBRARY_SAMPLE,
  TEMPLATE_SNAPSHOT_SAMPLE,
} from "./mock/seedLibrarySamples";

const SEED_TABLE_NAME = "test_no_rls";
const SNAPSHOT_TABLE_NAME = "test_rls_no_policy";

const SEED_LIBRARY_QUERY = `select id, name, summary from public.${SEED_TABLE_NAME} order by name asc limit 24`;
const TEMPLATE_SNAPSHOT_QUERY = `select id, name, snapshot_version from public.${SNAPSHOT_TABLE_NAME} order by updated_at desc limit 10`;

const seedLibraryDb = {
  async listSeeds() {
    return {
      rows: SEED_LIBRARY_SAMPLE,
      sql: SEED_LIBRARY_QUERY,
    };
  },
  async listSnapshots() {
    return {
      rows: TEMPLATE_SNAPSHOT_SAMPLE,
      sql: TEMPLATE_SNAPSHOT_QUERY,
    };
  },
};

export default async function SeedLibraryPage() {
  const copy = SEED_LIBRARY_COPY;
  const { rows: seeds } = await seedLibraryDb.listSeeds();
  const { rows: snapshots } = await seedLibraryDb.listSnapshots();
  // TODO: Highlight "recently used" seeds once usage metrics land.
  // TODO: Add a lightweight client-side filter for long seed lists.

  return (
    <main>
      <header>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      <section>
        <h2>{copy.sections.seeds}</h2>
        <ul>
          {seeds.map((seed) => (
            <li key={seed.id}>
              <strong>{seed.name}</strong>
              <div>{seed.summary}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{copy.sections.snapshots}</h2>
        <ul>
          {snapshots.map((snapshot) => (
            <li key={snapshot.id}>
              <strong>{snapshot.name}</strong>
              <div>Version: {snapshot.snapshotVersion}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
