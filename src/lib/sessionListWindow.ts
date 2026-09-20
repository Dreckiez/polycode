/** First paint of the sidebar; roughly one viewport's worth of session cards. */
export const SESSION_LIST_PAGE = 40;

/**
 * How many sorted session cards to mount. Always at least one page, and always
 * far enough to include the active session so its card is on screen.
 */
export function sessionListWindow(
  total: number,
  requested: number,
  activeIndex: number,
): number {
  if (total <= 0) return 0;
  const includeActive = activeIndex >= 0 ? activeIndex + 1 : 0;
  return Math.min(
    total,
    Math.max(SESSION_LIST_PAGE, requested, includeActive),
  );
}
