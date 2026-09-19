import { applyBayerDitherToBuffer, type DitherOptions } from "./dither";

export type DitherWorkerRequest = {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  options?: DitherOptions;
};

export type DitherWorkerResponse = {
  id: number;
  buffer?: ArrayBuffer;
  error?: string;
};

const ctx = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (
    type: "message",
    listener: (e: MessageEvent<DitherWorkerRequest>) => void,
  ) => void;
};

ctx.addEventListener("message", (e: MessageEvent<DitherWorkerRequest>) => {
  const { id, buffer, width, height, options } = e.data;
  try {
    const clamped = new Uint8ClampedArray(buffer);
    applyBayerDitherToBuffer(clamped, width, height, options);
    ctx.postMessage({ id, buffer: clamped.buffer } as DitherWorkerResponse, [
      clamped.buffer,
    ]);
  } catch (err: unknown) {
    ctx.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } as DitherWorkerResponse);
  }
});
