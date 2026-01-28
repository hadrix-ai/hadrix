export class StorageEmbeddingsDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageEmbeddingsDeleteError";
  }
}

export class StorageEmbeddingInsertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageEmbeddingInsertError";
  }
}
