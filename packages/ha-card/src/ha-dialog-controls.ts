/**
 * `ha-dialog`/`ha-button` are real HA frontend components, but (unlike `ha-card`) there's no
 * guarantee they're part of whatever JS chunk has loaded by the time our panel/card mounts.
 */
export function waitForHaPeriodEditDialog(): Promise<void> {
  return Promise.all([customElements.whenDefined("ha-dialog"), customElements.whenDefined("ha-button")]).then(
    () => undefined
  );
}
