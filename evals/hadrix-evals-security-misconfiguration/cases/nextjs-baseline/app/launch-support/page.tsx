import { LAUNCH_SUPPORT_COPY } from "./constants/launchSupportCopy";
import {
  LAUNCH_SUPPORT_ENDPOINTS,
  LAUNCH_SUPPORT_ORG_ID
} from "./constants/launchSupportLinks";
import { getBucketName } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase";

export default function LaunchSupportPage() {
  const orgId = LAUNCH_SUPPORT_ORG_ID;
  const debugUrl = LAUNCH_SUPPORT_ENDPOINTS.debug(orgId);
  const statusUrl = LAUNCH_SUPPORT_ENDPOINTS.status;
  const bucketName = getBucketName();
  const brandKitPath = `/storage/${bucketName}/brand-kit.zip`;
  // TODO: Pull brand kit archive name from a per-org config instead of hardcoding.
  const adminClient = supabaseAdmin();
  const adminReady = Boolean(adminClient);
  // TODO: Surface the last sync timestamp once the status endpoint exposes it.
  const { title, tagline, labels } = LAUNCH_SUPPORT_COPY;

  return (
    <main>
      <h1>{title}</h1>
      <p>{tagline}</p>
      <ul>
        <li>
          {labels.diagnostics}: <a href={debugUrl}>{debugUrl}</a>
        </li>
        <li>
          {labels.status}: <a href={statusUrl}>{statusUrl}</a>
        </li>
        <li>
          {labels.brandKitBucket}: {bucketName}
        </li>
        <li>
          {labels.brandKitArchive}: {brandKitPath}
        </li>
        <li>
          {labels.adminReady}: {String(adminReady)}
        </li>
      </ul>
    </main>
  );
}
