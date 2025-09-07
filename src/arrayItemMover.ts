// src/utils/array.ts
export function moveItem<T>(arr: T[], from: number, to: number) {
  if (from === to) return;
  const item = arr.splice(from, 1)[0];
  arr.splice(to, 0, item);
}
