/**
 * Fixed reference instant (not Date.now()) used to derive every mock
 * timestamp, so generated data — and any stats computed from it — are
 * identical on every server render and client hydration pass.
 */
export const MOCK_ANCHOR = new Date('2026-07-15T09:50:00Z').getTime();
