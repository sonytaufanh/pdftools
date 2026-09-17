export function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (!Array.isArray(list)) return list;
  if (fromIndex === toIndex) return list;
  if (fromIndex < 0 || fromIndex >= list.length) return list;

  const nextList = [...list];
  const [moved] = nextList.splice(fromIndex, 1);
  const safeIndex = Math.max(0, Math.min(toIndex, nextList.length));
  nextList.splice(safeIndex, 0, moved);
  return nextList;
}
