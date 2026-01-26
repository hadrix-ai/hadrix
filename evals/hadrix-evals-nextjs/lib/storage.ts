import { vulnEnabled } from "@/lib/hadrix";

export function getBucketName(): string {
  // HADRIX_VULN: A02 Security Misconfiguration
  // Public bucket usage without access controls.
  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.public_storage_bucket")) {
    return "public-assets";
  }
  return "private-assets";
}
