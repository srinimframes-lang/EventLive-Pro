/**
 * Wraps an async route handler so rejected promises are forwarded to Express'
 * error handler instead of crashing the process. Removes repetitive try/catch.
 *
 * @param {(req, res, next) => Promise<any>} fn
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
