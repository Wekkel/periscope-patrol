// ═══════════════════════════════════════════════════ DEVICE PROFILES
// Standardised device geometry and capabilities for Periscope Patrol test harness.

export const DEVICE_PROFILES = Object.freeze({
  DESKTOP_HD: Object.freeze({
    id: 'DESKTOP_HD',
    name: 'Desktop Full HD (1920x1080)',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    expectedLayout: 'desk',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PeriscopePatrolTestHarness/1.0'
  }),
  DESKTOP_STANDARD: Object.freeze({
    id: 'DESKTOP_STANDARD',
    name: 'Desktop Standard (1280x800)',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    expectedLayout: 'desk',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PeriscopePatrolTestHarness/1.0'
  }),
  MOBILE_PHONE: Object.freeze({
    id: 'MOBILE_PHONE',
    name: 'Mobile Phone (390x844)',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    expectedLayout: 'touch',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) PeriscopePatrolTestHarness/1.0'
  }),
  MOBILE_TABLET: Object.freeze({
    id: 'MOBILE_TABLET',
    name: 'Mobile Tablet Portrait (820x1180)',
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    expectedLayout: 'touch',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) PeriscopePatrolTestHarness/1.0'
  }),
  MOBILE_TABLET_LANDSCAPE: Object.freeze({
    id: 'MOBILE_TABLET_LANDSCAPE',
    name: 'Mobile Tablet Landscape (1180x820)',
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    expectedLayout: 'touch',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) PeriscopePatrolTestHarness/1.0'
  })
});

export function getDeviceProfile(key) {
  const profile = DEVICE_PROFILES[key];
  if (!profile) {
    const valid = Object.keys(DEVICE_PROFILES).join(', ');
    throw new Error(`Unknown device profile '${key}'. Available: ${valid}`);
  }
  return profile;
}
