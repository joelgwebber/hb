/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="card.ts" />
/// <reference path="lib/stmd.d.ts" />

module onde {
  // Basic CommonMark viewer.
  // TODO: This is pretty inefficient, because it re-renders from scratch every time it gets an op.
  //   It looks like there might be some methods in the parser for updating its model incrementally.
  //   Barring that, we can at least batch updates over a 1-2s window and render them all at once.
  export class MarkViewer implements View {
    private _binding: Binding;
    private _parser = new stmd.DocParser();
    private _renderer = new stmd.HtmlRenderer();

    constructor(private _elem: HTMLElement) {
    }

    bind(card: Card, prop: string) {
      this.unbind();

      this._binding = card.bind(prop, (value) => {
        this.update(value);
      }, (ops) => {
        // Skip the ops and just use the value directly.
        this.update(card.prop(prop));
      });
    }

    unbind() {
      if (this._binding) {
        this._binding.release();
        this._binding = null;
      }
    }

    elem(): HTMLElement {
      return this._elem;
    }

    private update(source: string) {
      var doc = this._parser.parse(source);
      this._elem.innerHTML = this._renderer.render(doc);
    }
  }

  // Simple text viewer.
  export class TextViewer implements View {
    private _binding: Binding;

    constructor(private _elem: HTMLElement) {
    }

    bind(card: Card, prop: string) {
      this.unbind();

      this._binding = card.bind(prop, (value) => {
        this._elem.textContent = value;
      }, (ops) => {
        // Skip the ops and just use the value directly.
        this._elem.textContent = card.prop(prop);
      });
    }

    unbind() {
      if (this._binding) {
        this._binding.release();
        this._binding = null;
      }
    }

    elem(): HTMLElement {
      return this._elem;
    }
  }
}
