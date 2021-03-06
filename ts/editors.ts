// Some parts adapted from github.com/mb0/lab:
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//

/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="card.ts" />
/// <reference path="lib/ace.d.ts" />

module hb {

  // Abstract base class for simple editors that always set the entire value at once.
  export class BasicEditor implements View {
    _card: Card;
    _prop: string;
    _binding: Binding;

    constructor(public _elem: HTMLElement) {
    }

    elem(): HTMLElement {
      return this._elem;
    }

    bind(card: Card, prop: string) {
      this._card = card;
      this._prop = prop;

      this.unbind();

      this._binding = card.bind(prop, (value) => {
        this._onValueChange(value);
      }, (ops) => {
        this._onValueChange(card.prop(prop));
      });
    }

    unbind() {
      if (this._binding) {
        this._binding.release();
        this._binding = null;
      }
    }

    _setValue(value: string) {
      var len = this._card.prop(this._prop).length;
      this._binding.revise([0, -len, value]);
    }

    _onValueChange(value: string) { throw "abstract"; }
  }

  export class SelectEditor extends BasicEditor {

    constructor(options: string[], captions: string[], elem: HTMLSelectElement = null) {
      super(elem || document.createElement("select"));
      if (options.length != captions.length) {
        throw "options/captions size mismatch";
      }
      for (var i = 0; i < options.length; ++i) {
        var option = <HTMLOptionElement>document.createElement("option");
        option.value = options[i];
        option.text = captions[i];
        this.elem().appendChild(option);
      }

      this.elem().onchange = (e) => {
        this._setValue(this.elem().value);
      };
    }

    elem(): HTMLSelectElement {
      return <HTMLSelectElement>super.elem();
    }

    _onValueChange(value: string) {
      this.elem().value = value;
    }
  }

  // Very simple editor that binds a checkbox to a "true/false" property.
  // If this editor finds it changed to something other than true/false, it will treat it as "false".
  // TODO: Implement simple typed properties so we can drop all this stupid stringly-typed code.
  export class CheckboxEditor extends BasicEditor {

    constructor(elem: HTMLInputElement = null) {
      super(elem || document.createElement("input"));
      this.elem().type = "checkbox";
      this._elem.onchange = () => {
        // Construct ops that clobber the whole value by deleting everything first.
        this._setValue(this.elem().checked ? "true" : "false");
      };
    }

    elem(): HTMLInputElement {
      return <HTMLInputElement>super.elem();
    }

    _onValueChange(value: string) {
      this.elem().checked = value == "true";
    }
  }

  // Simple editor that handles <input type=text> and <textarea> elements.
  // It's generates mutations using a naïve O(N) diff algorithm, and is thus not
  // suitable for large amounts of text.
  //
  // Adapted from github.com/share/ShareJS. See original license in LICENSES file.
  export class TextInputEditor implements View {
    private _elem: HTMLInputElement;
    private _binding: Binding;
    private _prevValue = "";
    private _merge: boolean;

    constructor() {
      this._elem = <HTMLInputElement>document.createElement("input");

      var eventNames = ["textInput", "keydown", "keyup", "select", "cut", "paste"];
      for (var i = 0; i < eventNames.length; i++) {
        this._elem.addEventListener(eventNames[i], (e) => { this.genOp(e); }, false);
      }
    }

    elem(): HTMLInputElement {
      return this._elem;
    }

    bind(card: Card, prop: string) {
      this.unbind();

      // _merge guards against op feedback loops.
      this._binding = card.bind(prop, (value) => {
        this._merge = true;
        this._elem.value = this._prevValue = value;
        this._merge = false;
      }, (ops) => {
        this._merge = true;
        this.applyOps(ops);
        this._merge = false;
      })
    }

    unbind() {
      if (this._binding) {
        this._binding.release();
        this._binding = null;
      }
    }

    private genOp(e: Event) {
      setTimeout(() => {
        if (this._elem.value !== this._prevValue) {
          var ops = makeChange(this._prevValue, this._elem.value.replace(/\r\n/g, "\n"));
          if (ops) {
            this._binding.revise(ops);
          }
          this._prevValue = this._elem.value;
        }
      }, 0);
    }

    // Replace the content of the text area with newText, and transform the
    // current cursor by the specified function.
    private replaceText(newText, transformCursor) {
      if (transformCursor) {
        var newSelection = [transformCursor(this._elem.selectionStart), transformCursor(this._elem.selectionEnd)];
      }

      // Fixate the window's scroll while we set the element's value. Otherwise
      // the browser scrolls to the element.
      var scrollTop = this._elem.scrollTop;
      this._elem.value = newText;
      this._prevValue = this._elem.value; // Not done on one line so the browser can do newline conversion.
      if (this._elem.scrollTop !== scrollTop) this._elem.scrollTop = scrollTop;

      // Setting the selection moves the cursor. We'll just have to let your
      // cursor drift if the element isn't active, though usually users don't
      // care.
      if (newSelection && document.activeElement === this._elem) {
        this._elem.selectionStart = newSelection[0];
        this._elem.selectionEnd = newSelection[1];
      }
    }

    private applyOps(ops: any[]) {
      var pos = 0;
      for (var i = 0; i < ops.length; ++i) {
        var op = ops[i];
        if (typeof op == "string") {
          this.onInsert(pos, op);
        } else if (op < 0) {
          this.onRemove(pos, -op);
        } else {
          pos += op;
        }
      }
    }

    private onInsert(pos, text) {
      var transformCursor = function (cursor) {
        return pos < cursor ? cursor + text.length : cursor;
      };

      // Remove any window-style newline characters. Windows inserts these, and
      // they mess up the generated diff.
      var prev = this._elem.value.replace(/\r\n/g, "\n");
      this.replaceText(prev.slice(0, pos) + text + prev.slice(pos), transformCursor);
    }

    private onRemove(pos, length) {
      var transformCursor = function (cursor) {
        // If the cursor is inside the deleted region, we only want to move back to the start
        // of the region. Hence the Math.min.
        return pos < cursor ? cursor - Math.min(length, cursor - pos) : cursor;
      };

      var prev = this._elem.value.replace(/\r\n/g, "\n");
      this.replaceText(prev.slice(0, pos) + prev.slice(pos + length), transformCursor);
    }
  }

  export function makeChange(oldval: string, newval: string): any[] {
    if (oldval === newval) {
      return null;
    }

    var commonStart = 0, firstLen = 0;
    while (true) {
      var oldch = oldval.charCodeAt(commonStart);
      var newch = newval.charCodeAt(commonStart);
      if (oldch != newch) {
        break;
      }
      commonStart++;
      firstLen += ot.utf8codelen(oldch);
    }

    var commonEnd = 0, lastLen = 0;
    while (true) {
      var oldch = oldval.charCodeAt(oldval.length - 1 - commonEnd);
      var newch = newval.charCodeAt(newval.length - 1 - commonEnd);
      var pos = commonEnd + commonStart;
      if ((oldch != newch) || (pos >= oldval.length) || (pos >= newval.length)) {
        break;
      }
      commonEnd++;
      lastLen += ot.utf8codelen(oldch);
    }

    var ret: any[] = [firstLen];
    if (oldval.length !== commonStart + commonEnd) {
      ret.push(-(ot.utf8len(oldval) - (firstLen + lastLen)));
    }
    if (newval.length !== commonStart + commonEnd) {
      ret.push(newval.slice(commonStart, newval.length - commonEnd));
    }
    ret.push(lastLen);
    return ret;
  }

  // Component that binds an Ace-based text editor to a Card.
  export class AceEditor implements View {
    private _elem: HTMLElement;
    private _ace: Ace.Editor;
    private _session: Ace.IEditSession;
    private _acedoc: Ace.Document;
    private _merge = false;
    private _binding: Binding;

    constructor() {
      this._elem = document.createElement("div");
      this._elem.className = "AceEditor";

      this._ace = ace.edit(this._elem);
      this._session = this._ace.getSession();
      this._acedoc = this._session.getDocument();
      this._ace.setTheme("ace/theme/textmate");
      this._ace.setHighlightActiveLine(false);
      this._ace.setShowPrintMargin(false);
      this._session.setMode("ace/mode/markdown");

      this._session.setUseWrapMode(true);

      this._acedoc.on("change", (e) => {
        if (this._merge) {
          // Don't re-send changes due to ops being applied (or if the card's not yet loaded).
          return;
        }

        var delta = <Ace.Delta>e.data;
        var ops = deltaToOps(documentLines(this._acedoc), delta);
        this._binding.revise(ops);
      });
    }

    elem(): HTMLElement {
      return this._elem;
    }

    bind(card: Card, prop: string) {
      this.unbind();

      // _merge guards against op feedback loops.
      this._binding = card.bind(prop, (value) => {
        this._merge = true;
        this._acedoc.setValue(value);
        this._merge = false;
      }, (ops) => {
        this._merge = true;
        applyOps(this._acedoc, ops);
        this._merge = false;
      })
    }

    unbind() {
      if (this._binding) {
        this._binding.release();
        this._binding = null;
      }
    }
  }

  var range = ace.require("ace/range");

  function utf8OffsetToPos(lines: string[], off: number, startrow: number): Ace.Position {
    if (!startrow) {
      startrow = 0;
    }
    var lastRow = lines.length;
    for (var i = startrow; i < lastRow; i++) {
      var line = lines[i];
      for (var j = 0; off > 0 && j < line.length; j++) {
        var c = line.charCodeAt(j);
        if (c > 0x10000) off -= 4;
        else if (c > 0x800) off -= 3;
        else if (c > 0x80) off -= 2;
        else off -= 1;
      }
      if (--off < 0 || i == lastRow - 1) {
        return {row: i, column: j};
      }
    }
    return {row: i - 1, column: j};
  }

  function posToRestIndex(lines: string[], pos: Ace.Position): { start: number; last: number } {
    var start = 0, last = 0;
    var lastRow = lines.length;
    var startRow = Math.min(pos.row, lastRow);
    for (var i = 0; i < lastRow; i++) {
      var c = ot.utf8len(lines[i]);
      last += c;
      if (i < startRow) {
        start += c;
      } else if (i == startRow) {
        start += ot.utf8len(lines[i].slice(0, pos.column));
      }
    }
    return {start: start + startRow, last: last + i - 1};
  }

  function documentLines(acedoc: Ace.Document): string[] {
    // HACK: Reach in and grab $lines private, because it's a hell of a lot more efficient.
    return acedoc["$lines"] || acedoc.getAllLines();
  }

  function joinLines(lines: string[]): string {
    var res = "";
    for (var i=0; i < lines.length; i++) {
      res += lines[i] + "\n";
    }
    return res;
  }

  function deltaToOps(lines: string[], delta: Ace.Delta): any[] {
    var idxr = posToRestIndex(lines, delta.range.start);
    var ops = [];
    switch (delta.action) {
      case "removeText":
        ops.push(-ot.utf8len(delta.text));
        break;
      case "removeLines":
        var i, n = 0;
        for (i = 0; i < delta.lines.length; i++)
          n -= ot.utf8len(delta.lines[i]);
        ops.push(n - i);
        break;
      case "insertText":
        ops.push(delta.text);
        idxr.last -= ot.utf8len(delta.text);
        break;
      case "insertLines":
        var text = joinLines(delta.lines);
        ops.push(text);
        idxr.last -= ot.utf8len(text);
        break;
      default:
        return [];
    }
    if (idxr.start) {
      ops.unshift(idxr.start);
    }
    if (idxr.last - idxr.start > 0) {
      ops.push(idxr.last - idxr.start);
    }
    return ops;
  }

  function applyOps(acedoc: Ace.Document, ops: any[]) {
    var lines = documentLines(acedoc);
    var count = ot.count(ops);
    var index = 0, pos: Ace.Position = {row: 0, column: 0}, op: any;
    var idxr = posToRestIndex(lines, pos);
    if (count[0] + count[1] != idxr.last) {
      throw "The base length must be equal to the document length";
    }
    var cache = {row: 0, at: 0};
    for (var i = 0; i < ops.length; i++) {
      if (!(op = ops[i])) {
        continue;
      }
      if (typeof op == "string") {
        pos = utf8OffsetToPos(lines, index - cache.at, cache.row);
        cache = {row: pos.row, at: index - pos.column};
        acedoc.insert(pos, op);
        index += ot.utf8len(op);
      } else if (op > 0) {
        index += op;
      } else if (op < 0) {
        var end = utf8OffsetToPos(lines, index - op - cache.at, cache.row);
        pos = utf8OffsetToPos(lines, index - cache.at, cache.row);
        cache = {row: pos.row, at: index - pos.column};
        acedoc.remove(new range.Range(pos.row, pos.column, end.row, end.column));
      }
    }
  }
}
