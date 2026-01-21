declare module "eslint-plugin-security" {
  const plugin: {
    configs?: {
      recommended?: {
        plugins?: string[];
        rules?: Record<string, unknown>;
        [key: string]: unknown;
      };
    };
    [key: string]: unknown;
  };
  export default plugin;
}
