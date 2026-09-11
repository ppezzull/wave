// No-op stand-in for the `server-only` guard package under vitest: the guard
// throws when a bundler resolves it OUTSIDE the react-server condition, which
// is exactly what node-environment tests do. The guard exists to stop CLIENT
// bundles from importing server modules — a unit test is neither.
const stub = {}
export default stub
