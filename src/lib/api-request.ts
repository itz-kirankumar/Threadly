export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RequestError";
  }
}

export async function readJsonBody(request: Request, maxBytes = 32 * 1024): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new RequestError("Send a JSON request.", 415);

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isFinite(Number(declaredLength)) && Number(declaredLength) > maxBytes) {
    throw new RequestError("Request body is too large.", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Send a request body.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    let complete = false;
    while (!complete) {
      const { done, value } = await reader.read();
      complete = done;
      if (complete) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Could not read the request body.", 400);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new RequestError("Send valid JSON.", 400);
  }
}

export function errorStatus(error: unknown, fallback = 500) {
  if (error instanceof RequestError) return error.status;
  const message = error instanceof Error ? error.message : "";
  if (/sign in|Firebase is not configured|FIREBASE_API_KEY|sign-in expired/i.test(message)) return 401;
  if (/rate limit service is unavailable/i.test(message)) return 503;
  if (/between 3 and 100|customer problem|topic to search|enter a customer|enter a valid company website/i.test(message)) return 400;
  if (/service returned HTTP|could not|timed out|temporarily unavailable|provider|failed to/i.test(message)) return 502;
  return fallback;
}

export function errorResponse(error: unknown, context: string, fallback = 500) {
  const status = errorStatus(error, fallback);
  if (status >= 500) console.error(`${context} failed (HTTP ${status})`);
  const message = error instanceof RequestError || status === 401
    ? (error instanceof Error ? error.message : "Request failed.")
    : status === 503
      ? "This service is temporarily unavailable. Please try again shortly."
      : status >= 500
        ? "The request could not be completed. Please try again."
        : (error instanceof Error ? error.message : "Request failed.");
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
