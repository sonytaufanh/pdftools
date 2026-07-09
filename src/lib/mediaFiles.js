export function isHeicFile(file) {
  const name = file.name.toLowerCase();
  return file.type === 'image/heic' ||
    name.endsWith('.heic');
}

export function isSupportedRasterFile(file) {
  const name = file.name.toLowerCase();
  return ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type) ||
    /\.(png|jpe?g)$/i.test(name);
}

export function isSupportedImageLikeFile(file) {
  return isSupportedRasterFile(file) || isHeicFile(file);
}

function blobToFile(blob, fileName, type) {
  return new File([blob], fileName, { type, lastModified: Date.now() });
}

export async function normalizeMediaFile(file) {
  if (isHeicFile(file)) {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92
    });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const outputName = file.name.replace(/\.heic$/i, '.jpg') || `${file.name}.jpg`;
    return blobToFile(blob, outputName, 'image/jpeg');
  }

  return file;
}
