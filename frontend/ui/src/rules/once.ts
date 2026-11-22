/** Memoizes a thunk. */
export const once = <T>(f: () => T): (() => T) => {
  let done = false;
  let v: T;
  return () => {
    if (!done) {
      v = f();
      done = true;
    }
    return v;
  };
};
