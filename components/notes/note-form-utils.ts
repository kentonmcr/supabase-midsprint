export const NO_COLLECTION = "none";

export function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
}
