import git from 'isomorphic-git';

/** Preserve decompression failures that isomorphic-git masks when annotating string errors. */
function normalizeError(cause: unknown): unknown {
  const message = cause instanceof Error ? cause.message : cause;
  if (
    message === 'buffer error' ||
    (cause instanceof TypeError &&
      /^Cannot create property 'caller' on string 'buffer error'$/.test(cause.message))
  )
    return Object.assign(
      new Error(
        'Git could not decompress repository data. An object may be empty, incomplete or damaged. ' +
          'Your notes have not been reset. Run git fsck --full in the repository with desktop Git ' +
          'to identify the affected objects before repairing them, then reopen Source Control.',
        { cause },
      ),
      { code: 'GitDecompressionError' },
    );
  return cause;
}

// Keep synchronous helpers such as TREE synchronous and preserve all other Git errors.
export default new Proxy(git, {
  get(target, property) {
    const value = Reflect.get(target, property);
    if (typeof value !== 'function') return value;
    return (...args: unknown[]) => {
      try {
        const result = Reflect.apply(value, target, args);
        return result instanceof Promise
          ? result.catch((cause: unknown) => {
              throw normalizeError(cause);
            })
          : result;
      } catch (cause) {
        throw normalizeError(cause);
      }
    };
  },
});
