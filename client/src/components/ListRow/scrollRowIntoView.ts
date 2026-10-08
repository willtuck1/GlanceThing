// Scrolls only the row's own list container. scrollIntoView() would also
// scroll the (overflow: hidden) TabPager sideways.
export function scrollRowIntoView(row: HTMLElement) {
  const container = row.closest<HTMLElement>('[data-scroll-container]')
  if (!container) return

  const rowRect = row.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  if (rowRect.top < containerRect.top) {
    container.scrollTop -= containerRect.top - rowRect.top
  } else if (rowRect.bottom > containerRect.bottom) {
    container.scrollTop += rowRect.bottom - containerRect.bottom
  }
}
