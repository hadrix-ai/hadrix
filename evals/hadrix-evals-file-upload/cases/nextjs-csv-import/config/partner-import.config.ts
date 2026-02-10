export const PARTNER_IMPORT_UPLOAD_CONFIG = {
  endpoint: "/api/import",
  method: "post",
  encoding: "multipart/form-data",
  fieldName: "csv"
} as const;
