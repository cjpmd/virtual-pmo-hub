/** "1 decision", "2 decisions"; pass `many` for irregular plurals. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
