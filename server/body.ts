/** Read JSON without letting an untrusted request allocate an unlimited body. */
export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the permitted size.");
    this.name = "BodyTooLargeError";
  }
}

export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) throw new SyntaxError("Missing JSON request body.");

  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let json = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      json += decoder.decode(value, { stream: true });
    }
    json += decoder.decode();
    return JSON.parse(json) as unknown;
  } finally {
    reader.releaseLock();
  }
}
