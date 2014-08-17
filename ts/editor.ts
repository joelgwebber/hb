/// <reference path="ot.ts" />

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
        var text = delta.lines.join("\n");
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
    private status = "";
    private merge = false;
    private wait: any[] = null;
    private buf: any[] = null;

    private editor: Ace.Editor;
    private session: Ace.IEditSession;
    private acedoc: Ace.Document;

    constructor(elem: HTMLElement, private rev: number, text: string, private opsHandler: (rev: number, ops: any[]) => void) {
      elem.textContent = text;

      this.editor = ace.edit(elem);
      this.session = this.editor.getSession();
      this.acedoc = this.session.getDocument();
      this.editor.setTheme("ace/theme/monokai");
      this.editor.getSession().setMode("ace/mode/javascript");

      this.acedoc.on('change', (e) => {
        if (this.merge) {
          // Don't re-send changes due to ops being applied.
          return;
        }

        var delta = <Ace.Delta>e.data;
        var ops = deltaToOps(documentLines(this.acedoc), delta);
        this.onChange(ops);
      });
    }

    recvOps(ops: any[]) {
      var res: any[] = null;
      if (this.wait !== null) {
        res = ot.transform(ops, this.wait);
        if (res[2] !== null) {
          return res[2];
        }
        ops = res[0];
        this.wait = res[1];
      }
      if (this.buf !== null) {
        res = ot.transform(ops, this.buf);
        if (res[2] !== null) {
          return res[2];
        }
        ops = res[0];
        this.buf = res[1];
      }
      this.merge = true;
      applyOps(this.acedoc, ops);
      this.merge = false;
      ++this.rev;
      this.status = "received";
    }

    ackOps(ops: any[]) {
      var rev = this.rev + 1;
      if (this.buf !== null) {
        this.wait = this.buf;
        this.buf = null;
        this.rev = rev;
        this.status = "waiting";
        this.opsHandler(rev, this.wait);
      } else if (this.wait !== null) {
        this.wait = null;
        this.rev = rev;
        this.status = "";
      }
    }

    private onChange(ops: any[]) {
      if (this.buf !== null) {
        var res = ot.compose(this.buf, ops);
        if (res[1] !== null) {
          throw "compose error";
        }
        this.buf = res[0];
      } else if (this.wait !== null) {
        this.buf = ops;
      } else {
        this.wait = ops;
        this.status = "waiting";
        this.opsHandler(this.rev, ops);
      }
    }
  }
}
