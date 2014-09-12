module onde {

  // Base class for all views. This can be pretty much any class with an associated
  // HTML element.
  export interface View {
    elem(): HTMLElement;
  }

  function _templateId(id: string) {
    return '|' + id;
  }

  // Interface describing a showable/hidable "pane". Used in the main navigation and
  // for dialog boxes.
  export interface Pane extends View {
    show();
    hide();
  }

  // A view whose instances can be stamped out from a template DOM fragment.
  //
  // The source fragment must already exist in the document, identified by an id of the
  // form '|TemplateName' (typically these would be in a display:none container to avoid
  // rendering the source templates).
  export class TemplateView implements View {
    private _elem: HTMLElement;

    constructor(id: string) {
      var elem = document.getElementById(_templateId(id));
      if (!elem) {
        throw 'No template with id "|' + id + '" found';
      }
      this._elem = <HTMLElement>elem.cloneNode(true);
      this._elem.removeAttribute('id');
    }

    elem(): HTMLElement {
      return this._elem;
    }

    // Gets the child element with the given css selector.
    //
    // There must be precisely one child element at the given selector. It is strongly
    // recommended that all children that a view instance needs be retrieved *before*
    // adding any new children to its DOM structure. Otherwise, name conflicts in child
    // templates can lead to hard-to-debug behavior.
    $(selector: string): HTMLElement {
      var children = this.elem().querySelectorAll(selector);
      if (children.length != 1) {
        throw 'Found ' + children.length + ' elements for selector ' + selector + ' (expected 1)';
      }
      return <HTMLElement>children[0];
    }

    // Determines whether this template has a child with the given class name.
    hasChild(selector: string): boolean {
      return this.elem().querySelectorAll(selector).length == 1;
    }
  }

  // Very simple dialog box. Simply automatically adds and removes itself to the container
  // element passed to its constructor. This will typically be used with a "fill" style --
  // e.g., { position:absolute; left-top-right-bottom:0 }.
  //
  // This class will look for a child with the selector .close-icon, and if found will use
  // it as a close button.
  //
  // TODO(jgw): Implement auto-hide tracking here so we can make it easy to ensure that
  // dialogs close cleanly on UI state transitions.
  export class Dialog extends TemplateView implements Pane {
    private _showGlass = false;
    private _glass: HTMLElement;

    constructor(id: string, private _container: HTMLElement= null) {
      super(id);

      if (this.hasChild('.close-icon')) {
        this.$('.close-icon').onclick = () => { this.hide(); };
      }

      // By default, put the dialog box on the body element, and show 'glass' underneath.
      if (this._container == null) {
        this._container = document.body;
        this._showGlass = true;
      }
    }

    show() {
      if (this._showGlass) {
        this._glass = document.createElement('div');
        this._glass.className = 'DialogGlass';
        this._container.appendChild(this._glass);
        this._glass.onclick = () => { this.hide(); };
      }
      this._container.appendChild(<HTMLElement>this.elem());
    }

    hide() {
      if (this._container.contains(<HTMLElement>this.elem())) this._container.removeChild(<HTMLElement>this.elem());
      if (this._showGlass) {
        this._container.removeChild(this._glass);
      }
    }
  }
}
