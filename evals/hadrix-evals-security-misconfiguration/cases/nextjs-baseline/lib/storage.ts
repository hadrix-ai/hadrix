import { vulnEnabled } from "@/lib/hadrix";

export function getBucketName(): string {
  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.public_storage_bucket")) {
    return "public-assets";
  }
  return "private-assets";
}
