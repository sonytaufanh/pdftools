export function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function getDroppedFiles(event) {
  return Array.from(event.dataTransfer?.files ?? []);
}
