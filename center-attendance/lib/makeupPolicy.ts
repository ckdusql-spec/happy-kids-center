// A makeup session is 40 minutes; regular lessons retain their existing duration.
export const MAKEUP_REQUIRED_MINUTES = 40

export const MAKEUP_MINUTE_OPTIONS = Array.from(
  { length: MAKEUP_REQUIRED_MINUTES / 10 },
  (_, index) => (index + 1) * 10,
)
