import { applyWiredoveStyles } from "./styles.js";
import { registerElement } from "./element.js";

export class WiredoveComposer extends HTMLElement {
  set onSubmit(value) {
    this._onSubmit = value;
  }
  set replyTo(value) {
    this._replyTo = value;
    this.render();
  }
  get replyTo() {
    return this._replyTo;
  }
  connectedCallback() {
    this.render();
  }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.replaceChildren();
    applyWiredoveStyles(root);
    const form = document.createElement("form");
    form.className = "message composer";
    const textarea = document.createElement("textarea");
    textarea.name = "body";
    textarea.placeholder = this._replyTo ? "Write a reply" : "Write a message";
    const controls = document.createElement("div");
    controls.className = "controls";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*,audio/*,video/*";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = this._replyTo ? "Reply" : "Publish";
    const status = document.createElement("div");
    status.className = "status";
    controls.append(file, submit);
    form.append(textarea, controls, status);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = "Publishing…";
      try {
        await this._onSubmit?.({
          body: textarea.value,
          file: file.files?.[0] || null,
          replyTo: this._replyTo || null,
        });
        textarea.value = "";
        file.value = "";
        status.textContent = "Published.";
        this.dispatchEvent(
          new CustomEvent("wiredove-published", { bubbles: true }),
        );
      } catch (error) {
        status.textContent = error?.message || "Could not publish.";
      } finally {
        submit.disabled = false;
      }
    });
    root.append(form);
  }
}

export function defineWiredoveComposer() {
  return registerElement("wiredove-composer", WiredoveComposer);
}
