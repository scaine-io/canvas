export function moveItem(arr, from, to) {
  if (from === to) return;
  const item = arr.splice(from, 1)[0];
  arr.splice(to, 0, item);
}
