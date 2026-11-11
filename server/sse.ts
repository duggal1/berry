export type Send = (event: string, data: unknown) => void;

/** A server sent event stream. Every event is flushed as it happens. */
export function eventStream(run: (send: Send) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const send: Send = (event, data) => {
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const keepalive = setInterval(() => write(": keepalive\n\n"), 15000);

      run(send)
        .catch((e: unknown) =>
          send("error", {
            message: e instanceof Error ? e.message : "The request failed.",
          }),
        )
        .finally(() => {
          clearInterval(keepalive);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Split text into chunks so a cached answer can be replayed like a live one. */
export function chunkText(text: string, size = 240): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
