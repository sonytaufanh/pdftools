interface RenderTaskLike {
  promise: Promise<unknown>;
  cancel(): void;
}

interface CancellablePage {
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): RenderTaskLike;
}

export function isRenderCancelled(error: unknown): boolean {
  const name = (error as { name?: string } | null | undefined)?.name;
  return name === 'RenderingCancelledException' || name === 'AbortError';
}

export async function renderPageWithCancellation(
  page: CancellablePage,
  canvasContext: CanvasRenderingContext2D,
  viewport: unknown,
  signal?: AbortSignal | null
): Promise<unknown> {
  const renderTask = page.render({ canvasContext, viewport });

  if (!signal) {
    return renderTask.promise;
  }

  if (signal.aborted) {
    renderTask.cancel();
  }

  const handleAbort = () => renderTask.cancel();
  signal.addEventListener('abort', handleAbort, { once: true });

  try {
    return await renderTask.promise;
  } finally {
    signal.removeEventListener('abort', handleAbort);
  }
}
