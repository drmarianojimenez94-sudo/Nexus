/** Prevent an earlier read from publishing after navigation or a newer reload. */
export function createLatestRequest() {
  let generation = 0;
  return {
    invalidate() {
      generation++;
    },
    async run<T>(
      read: () => Promise<T>,
      publish: (result: { data: T } | { error: unknown }) => void,
    ) {
      const current = ++generation;
      try {
        const data = await read();
        if (current === generation) publish({ data });
      } catch (error) {
        if (current === generation) publish({ error });
      }
    },
  };
}
