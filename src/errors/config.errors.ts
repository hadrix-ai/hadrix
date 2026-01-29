export class ConfigUnsupportedProviderError extends Error {
  constructor() {
    super("Unsupported provider. Use openai or anthropic (claude).");
    this.name = "ConfigUnsupportedProviderError";
  }
}

export class ConfigMissingApiKeyError extends Error {
  constructor() {
    super(
      "Missing API key. Set HADRIX_API_KEY (or provider-specific keys like OPENAI_API_KEY or ANTHROPIC_API_KEY) or api.apiKey in hadrix.config.json."
    );
    this.name = "ConfigMissingApiKeyError";
  }
}

export class ConfigMissingApiBaseUrlError extends Error {
  constructor() {
    super(
      "Missing API base URL. Set HADRIX_API_BASE (or provider-specific bases like OPENAI_API_BASE or ANTHROPIC_API_BASE) or api.baseUrl in hadrix.config.json."
    );
    this.name = "ConfigMissingApiBaseUrlError";
  }
}
