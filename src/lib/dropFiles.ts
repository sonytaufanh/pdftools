export interface DragFilesEvent {
  dataTransfer?: {
    types?: ArrayLike<string>;
    files?: ArrayLike<File>;
  } | null;
}

export function hasDraggedFiles(event: DragFilesEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function getDroppedFiles(event: DragFilesEvent): File[] {
  return Array.from(event.dataTransfer?.files ?? []);
}
