export type ArchiveFileInfo = {
  name: string;
  size: number;
  originalSize: number;
  compression: number;
};

export type ArchiveLimits = {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
};

export class ArchiveLimitExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveLimitExceeded";
  }
}

/** Budget estimated uncompressed output before asking fflate to inflate it. */
export function createArchiveFilter(
  limits: ArchiveLimits,
  skip: (name: string) => boolean = () => false,
): (file: ArchiveFileInfo) => boolean {
  let totalBytes = 0;
  let extractedFiles = 0;
  return (file) => {
    if (file.name.endsWith("/") || skip(file.name)) return false;
    const size = file.originalSize;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new ArchiveLimitExceeded("Archive contains invalid uncompressed-size metadata.");
    }
    if (size > limits.maxFileBytes) return false;
    if (extractedFiles + 1 > limits.maxFiles || totalBytes + size > limits.maxTotalBytes) {
      throw new ArchiveLimitExceeded("Archive's uncompressed contents exceed analysis limits.");
    }
    extractedFiles++;
    totalBytes += size;
    return true;
  };
}
