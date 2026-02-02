import { vulnEnabled } from "@/lib/hadrix";

type BucketConfig = {
  name: string;
  access: "public" | "private";
};

const bucketOptions: Record<BucketConfig["access"], BucketConfig> = {
  public: { name: "public-assets", access: "public" },
  private: { name: "private-assets", access: "private" },
};

const publicBucketToggle = [
  "vulnerabilities",
  "A02_security_misconfiguration",
  "public_storage_bucket",
].join(".");

function getBucketAccess(): BucketConfig["access"] {
  return vulnEnabled(publicBucketToggle) ? "public" : "private";
}

export function getBucketName(): string {
  return bucketOptions[getBucketAccess()].name;
}
