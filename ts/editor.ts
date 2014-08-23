// Some parts adapted from github.com/mb0/lab
//
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//

/// <reference path="ot.ts" />
/// <reference path="lib/ace.d.ts" />

module onde {
  var range = ace.require('ace/range');

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
      if (--off < 0 || i == lastRow - 1)
        return {row: i, column: j};
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
    return acedoc['$lines'] || acedoc.getAllLines();
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

  export class Editor {
    private _status = "";
    private _merge = false;
    private _wait: any[] = null;
    private _buf: any[] = null;
    private _elem: HTMLElement;
    private _ace: Ace.Editor;
    private _session: Ace.IEditSession;
    private _acedoc: Ace.Document;

    constructor(private docId: string, private rev: number, text: string, private opsHandler: (docId: string, rev: number, ops: any[]) => void) {
      this._elem = document.createElement("div");
      this._elem.className = "Editor";
      this._elem.textContent = text;

      this._ace = ace.edit(this._elem);
      this._session = this._ace.getSession();
      this._acedoc = this._session.getDocument();
      this._ace.setTheme("ace/theme/textmate");
      this._ace.setHighlightActiveLine(false);
      this._ace.setShowPrintMargin(false);
      this._session.setMode("ace/mode/markdown");

      this._acedoc.on('change', (e) => {
        if (this._merge) {
          // Don't re-send changes due to ops being applied.
          return;
        }

        var delta = <Ace.Delta>e.data;
        var ops = deltaToOps(documentLines(this._acedoc), delta);
        this.onChange(ops);
      });
    }

    elem(): HTMLElement {
      return this._elem;
    }

    recvOps(ops: any[]) {
      var res: any[] = null;
      if (this._wait !== null) {
        res = ot.transform(ops, this._wait);
        if (res[2] !== null) {
          return res[2];
        }
        ops = res[0];
        this._wait = res[1];
      }
      if (this._buf !== null) {
        res = ot.transform(ops, this._buf);
        if (res[2] !== null) {
          return res[2];
        }
        ops = res[0];
        this._buf = res[1];
      }
      this._merge = true;
      applyOps(this._acedoc, ops);
      this._merge = false;
      ++this.rev;
      this._status = "received";
    }

    ackOps(ops: any[]) {
      var rev = this.rev + 1;
      if (this._buf !== null) {
        this._wait = this._buf;
        this._buf = null;
        this.rev = rev;
        this._status = "waiting";
        this.opsHandler(this.docId, rev, this._wait);
      } else if (this._wait !== null) {
        this._wait = null;
        this.rev = rev;
        this._status = "";
      }
    }

    private onChange(ops: any[]) {
      if (this._buf !== null) {
        this._buf = ot.compose(this._buf, ops);
      } else if (this._wait !== null) {
        this._buf = ops;
      } else {
        this._wait = ops;
        this._status = "waiting";
        this.opsHandler(this.docId, this.rev, ops);
      }
    }
  }
}
