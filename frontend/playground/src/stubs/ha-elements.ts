type ElementCtor = CustomElementConstructor;

function define(tag: string, ctor: ElementCtor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

function shadow(el: HTMLElement, html: string): ShadowRoot {
  const root = el.attachShadow({ mode: "open" });
  root.innerHTML = html;
  return root;
}

class HaCardStub extends HTMLElement {
  static observedAttributes = ["header"];
  private _header!: HTMLElement;

  connectedCallback(): void {
    if (this.shadowRoot) return;
    const root = shadow(
      this,
      `<style>
        :host {
          display: block;
          position: relative;
          background: var(--ha-card-background, var(--card-background-color, #fff));
          color: var(--primary-text-color);
          border-radius: var(--ha-card-border-radius, 12px);
          border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
          box-shadow: var(--ha-card-box-shadow, none);
          backdrop-filter: var(--ha-card-backdrop-filter, none);
          -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
          overflow: hidden;
        }
        .header {
          font-size: var(--ha-card-header-font-size, 24px);
          padding: 24px 16px 16px;
        }
        .header:empty { display: none; }
      </style>
      <div class="header"></div><slot></slot>`
    );
    this._header = root.querySelector(".header") as HTMLElement;
    this._header.textContent = this.getAttribute("header") ?? "";
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "header" && this._header) this._header.textContent = value ?? "";
  }
}

class HaSwitchStub extends HTMLElement {
  static observedAttributes = ["checked", "disabled"];
  private _input!: HTMLInputElement;

  connectedCallback(): void {
    if (this.shadowRoot) return;
    const root = shadow(
      this,
      `<style>
        :host { display: inline-flex; vertical-align: middle; }
        input { appearance: none; width: 36px; height: 20px; border-radius: 10px; margin: 0; cursor: pointer;
          background: var(--switch-unchecked-track-color, var(--disabled-text-color, #bdbdbd)); position: relative; transition: background .15s; }
        input::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
          background: var(--switch-unchecked-color, #fff); transition: transform .15s; }
        input:checked { background: var(--switch-checked-track-color, var(--primary-color)); }
        input:checked::after { transform: translateX(16px); }
        input:disabled { opacity: .5; cursor: default; }
      </style><input type="checkbox" />`
    );
    this._input = root.querySelector("input") as HTMLInputElement;
    this._input.checked = this.hasAttribute("checked");
    this._input.disabled = this.hasAttribute("disabled");
    this._input.addEventListener("change", () => {
      this.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  attributeChangedCallback(name: string): void {
    if (!this._input) return;
    if (name === "checked") this._input.checked = this.hasAttribute("checked");
    if (name === "disabled") this._input.disabled = this.hasAttribute("disabled");
  }

  get checked(): boolean {
    return this._input ? this._input.checked : this.hasAttribute("checked");
  }
  set checked(v: boolean) {
    this.toggleAttribute("checked", !!v);
    if (this._input) this._input.checked = !!v;
  }
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(v: boolean) {
    this.toggleAttribute("disabled", !!v);
  }
}

class HaButtonStub extends HTMLElement {
  static observedAttributes = ["disabled", "variant"];

  connectedCallback(): void {
    if (this.shadowRoot) return;
    shadow(
      this,
      `<style>
        :host { display: inline-block; }
        button { font: inherit; cursor: pointer; padding: 8px 16px; border-radius: 18px; border: 1px solid transparent;
          background: transparent; color: var(--primary-color); font-weight: 500; }
        button:hover { background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
        :host([variant="brand"]) button, :host([appearance="filled"]) button { background: var(--primary-color); color: var(--text-primary-color, #fff); }
        :host([variant="danger"]) button { color: var(--error-color); }
        :host([disabled]) button { opacity: .5; pointer-events: none; }
      </style><button type="button"><slot></slot></button>`
    );
  }
}

class HaDialogStub extends HTMLElement {
  static observedAttributes = ["open"];

  connectedCallback(): void {
    if (this.shadowRoot) return;
    shadow(
      this,
      `<style>
        :host { display: none; position: fixed; inset: 0; z-index: 1000; align-items: center; justify-content: center; }
        :host([open]) { display: flex; }
        .scrim { position: absolute; inset: 0; background: var(--mdc-dialog-scrim-color, rgba(0,0,0,.5)); }
        .surface { position: relative; min-width: 280px; max-width: min(560px, 92vw); max-height: 86vh; overflow: auto;
          background: var(--mdc-theme-surface, var(--card-background-color, #fff)); color: var(--primary-text-color);
          border-radius: var(--ha-dialog-border-radius, 24px); padding: 24px;
          backdrop-filter: var(--ha-dialog-surface-backdrop-filter, none); -webkit-backdrop-filter: var(--ha-dialog-surface-backdrop-filter, none);
          box-shadow: 0 8px 32px rgba(0,0,0,.3); }
        h2 { margin: 0 0 16px; font-size: 1.4em; font-weight: 400; }
        h2:empty { display: none; }
        .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      </style>
      <div class="scrim"></div>
      <div class="surface" role="dialog">
        <h2></h2><slot></slot>
        <div class="footer"><slot name="secondaryAction"></slot><slot name="primaryAction"></slot><slot name="footer"></slot></div>
      </div>`
    );
    this.shadowRoot!.querySelector(".scrim")!.addEventListener("click", () => {
      this.open = false;
      this.dispatchEvent(new Event("closed", { bubbles: true, composed: true }));
    });
    this._syncTitle();
  }

  attributeChangedCallback(name: string): void {
    if (name === "open" && this.shadowRoot) this.dispatchEvent(new Event(this.open ? "opened" : "closed"));
  }

  private _syncTitle(): void {
    const h = this.shadowRoot?.querySelector("h2");
    if (h) h.textContent = this.getAttribute("header-title") ?? this.getAttribute("heading") ?? "";
  }

  get open(): boolean {
    return this.hasAttribute("open");
  }
  set open(v: boolean) {
    this.toggleAttribute("open", !!v);
    this._syncTitle();
  }
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string) {
    this.setAttribute("heading", v);
    this._syncTitle();
  }
  close(): void {
    this.open = false;
  }
}

class HaIconButtonStub extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return;
    shadow(
      this,
      `<style>
        :host { display: inline-flex; }
        button { width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; cursor: pointer;
          color: var(--secondary-text-color); font: inherit; }
        button:hover { background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
      </style><button type="button"><slot></slot></button>`
    );
    this.shadowRoot!.querySelector("button")!.setAttribute("aria-label", this.getAttribute("label") ?? "");
  }
}

class HaTimeInputStub extends HTMLElement {
  private _value = "00:00:00";
  private _input?: HTMLInputElement;

  connectedCallback(): void {
    if (this.shadowRoot) return;
    const root = shadow(this, `<style>input { font: inherit; padding: 6px; }</style><input type="time" step="1" />`);
    this._input = root.querySelector("input") as HTMLInputElement;
    this._input.value = this._value;
    this._input.addEventListener("change", () => {
      this._value = this._input!.value.length === 5 ? `${this._input!.value}:00` : this._input!.value;
      this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    });
  }

  get value(): string {
    return this._value;
  }
  set value(v: string) {
    this._value = v;
    if (this._input) this._input.value = v;
  }
}

export function defineHaStubs(): void {
  define("ha-card", HaCardStub);
  define("ha-switch", HaSwitchStub);
  define("ha-button", HaButtonStub);
  define("ha-dialog", HaDialogStub);
  define("ha-icon-button", HaIconButtonStub);
  define("ha-time-input", HaTimeInputStub);
}
