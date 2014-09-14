/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="card.ts" />
/// <reference path="lib/stmd.d.ts" />

module onde {

  function nearestAnchor(node: Node): HTMLAnchorElement {
    while (node) {
      if (node.nodeType == Node.ELEMENT_NODE) {
        var elem = <HTMLElement>node;
        if (elem.tagName.toLowerCase() == 'a') {
          return <HTMLAnchorElement>elem;
        }
      }
      node = node.parentNode;
    }
    return null;
  }

  // Basic CommonMark viewer.
  // TODO: This is pretty inefficient, because it re-renders from scratch every time it gets an op.
  //   It looks like there might be some methods in the parser for updating its model incrementally.
  //   Barring that, we can at least batch updates over a 1-2s window and render them all at once.
  export class MarkViewer implements View {
    private _binding: Binding;
    private _parser = new stmd.DocParser();
    private _renderer = new stmd.HtmlRenderer();

    constructor(private _ctx: Context, private _elem: HTMLElement) {
      // Capture mouse clicks and forward certain links to pushState().
      _elem.addEventListener("click", (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) {
          // Don't eat anything but normal left-clicks.
          return;
        }

        var a = nearestAnchor(<Node>e.target);
        if (a) {
          if (a.host == location.host) {
            if (a.pathname.indexOf("/card/") == 0) {
              e.preventDefault();
              _ctx.history().navigate(a.pathname.slice(1).split("/"));
            }
          }
        }
      }, true);
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
