export interface SaveTarget {
  name: string;
  save(blob: Blob): Promise<void>;
}

interface SaveTargetOptions {
  suggestedName: string;
  mimeType: string;
  extensions: string[];
  description: string;
}

interface WritableFileStream {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandle {
  name: string;
  createWritable(): Promise<WritableFileStream>;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileHandle>;
};

export function ensureExtension(fileName: string | null | undefined, extension: string): string {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  const trimmedName = (fileName || 'document').trim() || 'document';
  return trimmedName.toLowerCase().endsWith(normalizedExtension.toLowerCase())
    ? trimmedName
    : `${trimmedName}${normalizedExtension}`;
}

export function buildPdfFileName(value?: string | null, fallbackName = 'document'): string {
  const normalized = (value || fallbackName).trim().replace(/\.pdf$/i, '');
  return `${normalized || fallbackName}.pdf`;
}

export async function requestSaveTarget({
  suggestedName,
  mimeType,
  extensions,
  description
}: SaveTargetOptions): Promise<SaveTarget | null> {
  const normalizedExtensions = extensions.map(extension =>
    extension.startsWith('.') ? extension : `.${extension}`
  );
  const fallbackExtension = normalizedExtensions[0] ?? '';
  const safeSuggestedName = fallbackExtension
    ? ensureExtension(suggestedName, fallbackExtension)
    : suggestedName;
  const pickerWindow = window as PickerWindow;

  if (typeof pickerWindow.showSaveFilePicker === 'function') {
    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: safeSuggestedName,
        types: [
          {
            description,
            accept: { [mimeType]: normalizedExtensions }
          }
        ]
      });

      return {
        name: handle.name || safeSuggestedName,
        async save(blob: Blob) {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        }
      };
    } catch (error) {
      if ((error as DOMException | undefined)?.name === 'AbortError') return null;
      console.warn(error);
    }
  }

  const extension = fallbackExtension || '';
  const defaultBase =
    extension && safeSuggestedName.toLowerCase().endsWith(extension.toLowerCase())
      ? safeSuggestedName.slice(0, -extension.length)
      : safeSuggestedName;
  const requestedName = window.prompt('Output name', defaultBase);
  if (requestedName === null) return null;
  const finalName = extension
    ? ensureExtension(requestedName, extension)
    : requestedName.trim() || safeSuggestedName;

  return {
    name: finalName,
    async save(blob: Blob) {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = finalName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  };
}

export function requestPdfSaveTarget(
  defaultBaseName?: string,
  fallbackName = 'document'
): Promise<SaveTarget | null> {
  return requestSaveTarget({
    suggestedName: buildPdfFileName(defaultBaseName, fallbackName),
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
    description: 'PDF document'
  });
}
