/**
 * Mock 数据工厂 —— v3.1.25 已移到 packages/core/src/testing/MockFactory.ts
 *   - 让 packages/core 的 unit test 也能用同一份 factory（IdentityRegression.test.ts）
 *   - preview 这里只是 re-export
 */
export { generateMockData, type MockUserSpec } from '@chord/core'
