export function ensureExtension(fileName, extension) {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  const trimmedName = (fileName || 'document').trim() || 'document';
  return trimmedName.toLowerCase().endsWith(normalizedExtension.toLowerCase())
    ? trimmedName
    : `${trimmedName}${normalizedExtension}`;
}

export function buildPdfFileName(value, fallbackName = 'document') {
  const normalized = (value || fallbackName).trim().replace(/\.pdf$/i, '');
  return `${normalized || fallbackName}.pdf`;
}

export async function requestSaveTarget({ suggestedName, mimeType, extensions, description }) {
  const normalizedExtensions = extensions.map(extension => (extension.startsWith('.') ? extension : `.${extension}`));
  const fallbackExtension = normalizedExtensions[0] ?? '';
  const safeSuggestedName = fallbackExtension ? ensureExtension(suggestedName, fallbackExtension) : suggestedName;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
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
        async save(blob) {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        }
      };
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      console.warn(error);
    }
  }

  const extension = fallbackExtension || '';
  const defaultBase = extension && safeSuggestedName.toLowerCase().endsWith(extension.toLowerCase())
    ? safeSuggestedName.slice(0, -extension.length)
    : safeSuggestedName;
  const requestedName = window.prompt('Output name', defaultBase);
  if (requestedName === null) return null;
  const finalName = extension ? ensureExtension(requestedName, extension) : (requestedName.trim() || safeSuggestedName);

  return {
    name: finalName,
    async save(blob) {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = finalName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  };
}

export function requestPdfSaveTarget(defaultBaseName, fallbackName = 'document') {
  return requestSaveTarget({
    suggestedName: buildPdfFileName(defaultBaseName, fallbackName),
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
    description: 'PDF document'
  });
}
