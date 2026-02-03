import { toggleEnabled } from "@/lib/hadrix";

export function getBucketName(): string {
  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.storage_bucket_open_access")) {
    return "public-assets";
  }
  return "private-assets";
}
