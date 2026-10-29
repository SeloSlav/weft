/** Tracks one caller-owned revision. Values are compared with Object.is. */
export class InputVersionTracker {
  private initialized = false
  private value: unknown

  changed(read: () => unknown): boolean {
    return this.initialized && !Object.is(read(), this.value)
  }

  sync(read: () => unknown, invalidate: () => void): void {
    const next = read()
    // Some presets build geometry in their constructor, before the first update.
    if (!this.initialized || !Object.is(next, this.value)) invalidate()
    this.value = next
    this.initialized = true
  }
}
