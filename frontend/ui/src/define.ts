// Every card bundle ships its own copy of these elements; the first one loaded wins.
export const safeCustomElement =
  (tag: string) =>
  (cls: CustomElementConstructor): void => {
    if (!customElements.get(tag)) {
      customElements.define(tag, cls);
    }
  };
