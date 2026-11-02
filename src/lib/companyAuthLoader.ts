// Auth callbacks must return before queries acquire the auth client's lock.
export function createCompanyAuthLoader(load: (userId: string | null) => Promise<void>, pending: () => void) {
  let previous: string | null | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  return {
    update(userId: string | null) {
      if (disposed || previous === userId) return;
      previous = userId;
      if (timer !== undefined) clearTimeout(timer);
      pending();
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed) void load(userId);
      }, 0);
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}