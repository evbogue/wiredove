// Registration is explicit: importing a widget never boots an application.
export function registerElement(name, ElementClass) {
  if (!globalThis.customElements) throw new Error("Wiredove UI requires a browser");
  if (!customElements.get(name)) customElements.define(name, ElementClass);
  return customElements.get(name);
}
