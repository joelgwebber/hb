var onde;
(function (onde) {
    onde.MsgLogin = "login";
    onde.MsgSubscribe = "subscribe";
    onde.MsgRevise = "revise";
})(onde || (onde = {}));
// Adapted to Typescript from original ot.js source:
//
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
// Package ot is a simple version of the operation transformation library:
// ot.js (c) 2012-2013 Tim Baumann http://timbaumann.info MIT licensed.
//
var ot;
(function (ot) {
    // All the 'any[]' types are of the form:
    //   [5, -2, "text"] // retain 5, delete 2, insert "text"
    //
    // Each entry represents a single operation.
    // If op is number N it signifies:
    //   N > 0: Retain op bytes
    //   N < 0: Delete -op bytes
    //   B == 0: Noop
    // If op is string S of utf8len N:
    //   N > 0: Insert string S
    //   N == 0: Noop
    // javascript characters use UCS-2 encoding. we need utf-8 byte counts
    function utf8len(str) {
        var n = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c > 0x10000)
                n += 4;
else if (c > 0x800)
                n += 3;
else if (c > 0x80)
                n += 2;
else
                n += 1;
        }
        return n;
    }
    ot.utf8len = utf8len;

    // Count returns the number of retained, deleted and inserted bytes.
    function count(ops) {
        var ret = 0, del = 0, ins = 0;
        for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            if (typeof op == "string") {
                ins += utf8len(op);
            } else if (op < 0) {
                del += -op;
            } else if (op > 0) {
                ret += op;
            }
        }
        return [ret, del, ins];
    }
    ot.count = count;

    // Merge attempts to merge consecutive operations the sequence.
    function merge(ops) {
        var lastop = 0;
        var res = [];
        for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            if (!op)
                continue;
            var type = typeof op;
            if (type == typeof lastop && (type == "string" || op > 0 && lastop > 0 || op < 0 && lastop < 0)) {
                res[res.length - 1] = lastop + op;
            } else {
                res.push(op);
            }
            lastop = res[res.length - 1];
        }
        return res;
    }
    ot.merge = merge;

    // Compose returns an operation sequence composed from the consecutive ops a and b.
    function compose(a, b) {
        if (!a || !b) {
            throw "Compose requires nonempty ops.";
        }
        var acount = count(a), bcount = count(b);
        if (acount[0] + acount[2] != bcount[0] + bcount[1]) {
            throw "Compose requires consecutive ops.";
        }
        var res = [];
        var ia = 0, ib = 0;
        var oa = a[ia++], ob = b[ib++];
        while (!!oa || !!ob) {
            var ta = typeof oa;
            if (ta == "number" && oa < 0) {
                res.push(oa);
                oa = a[ia++];
                continue;
            }
            var tb = typeof ob;
            if (tb == "string") {
                res.push(ob);
                ob = b[ib++];
                continue;
            }
            if (!oa || !ob || tb != "number") {
                throw "Compose encountered a short operation sequence.";
            }
            var od;
            if (ta == tb && oa > 0 && ob > 0) {
                od = oa - ob;
                if (od > 0) {
                    oa -= ob;
                    res.push(ob);
                    ob = b[ib++];
                } else if (od < 0) {
                    ob -= oa;
                    res.push(oa);
                    oa = a[ia++];
                } else {
                    res.push(oa);
                    oa = a[ia++];
                    ob = b[ib++];
                }
            } else if (ta == "string" && ob < 0) {
                od = utf8len(oa) + ob;
                if (od > 0) {
                    oa = oa.substr(-ob);
                    ob = b[ib++];
                } else if (od < 0) {
                    ob = od;
                    oa = a[ia++];
                } else {
                    oa = a[ia++];
                    ob = b[ib++];
                }
            } else if (ta == "string" && ob > 0) {
                od = utf8len(oa) - ob;
                if (od > 0) {
                    res.push(oa.substr(0, ob));
                    oa = oa.substr(ob);
                    ob = b[ib++];
                } else if (od < 0) {
                    ob = -od;
                    res.push(oa);
                    oa = a[ia++];
                } else {
                    res.push(oa);
                    oa = a[ia++];
                    ob = b[ib++];
                }
            } else if (ta == tb && oa > 0 && ob < 0) {
                od = oa + ob;
                if (od > 0) {
                    oa += ob;
                    res.push(ob);
                    ob = b[ib++];
                } else if (od < 0) {
                    ob += oa;
                    res.push(oa * -1);
                    oa = a[ia++];
                } else {
                    res.push(ob);
                    oa = a[ia++];
                    ob = b[ib++];
                }
            } else {
                throw "This should never have happened.";
            }
        }
        return merge(res);
    }
    ot.compose = compose;

    // Transform returns two operation sequences derived from the concurrent ops a and b.
    function transform(a, b) {
        if (!a || !b) {
            return [a, b];
        }
        var acount = count(a), bcount = count(b);
        if (acount[0] + acount[1] != bcount[0] + bcount[1]) {
            throw "Transform requires concurrent ops.";
        }
        var a1 = [], b1 = [];
        var ia = 0, ib = 0;
        var oa = a[ia++], ob = b[ib++];
        while (!!oa || !!ob) {
            var ta = typeof oa;
            if (ta == "string") {
                a1.push(oa);
                b1.push(utf8len(oa));
                oa = a[ia++];
                continue;
            }
            var tb = typeof ob;
            if (tb == "string") {
                a1.push(utf8len(ob));
                b1.push(ob);
                ob = b[ib++];
                continue;
            }
            if (!oa || !ob || ta != "number" || tb != ta) {
                throw "Compose encountered a short operation sequence.";
            }
            var od, om;
            if (oa > 0 && ob > 0) {
                od = oa - ob;
                if (od > 0) {
                    om = ob;
                    oa -= ob;
                    ob = b[ib++];
                } else if (od < 0) {
                    om = oa;
                    ob -= oa;
                    oa = a[ia++];
                } else {
                    om = oa;
                    oa = a[ia++];
                    ob = b[ib++];
                }
                a1.push(om);
                b1.push(om);
            } else if (oa < 0 && ob < 0) {
                od = -oa + ob;
                if (od > 0) {
                    oa -= ob;
                    ob = b[ib++];
                } else if (od < 0) {
                    ob -= oa;
                    oa = a[ia++];
                } else {
                    oa = a[ia++];
                    ob = b[ib++];
                }
            } else if (oa < 0 && ob > 0) {
                od = -oa - ob;
                if (od > 0) {
                    om = -ob;
                    oa += ob;
                    ob = b[ib++];
                } else if (od < 0) {
                    om = oa;
                    ob += oa;
                    oa = a[ia++];
                } else {
                    om = oa;
                    oa = a[ia++];
                    ob = b[ib++];
                }
                a1.push(om);
            } else if (oa > 0 && ob < 0) {
                od = oa + ob;
                if (od > 0) {
                    om = ob;
                    oa += ob;
                    ob = b[ib++];
                } else if (od < 0) {
                    om = -oa;
                    ob += oa;
                    oa = a[ia++];
                } else {
                    om = -oa;
                    oa = a[ia++];
                    ob = b[ib++];
                }
                b1.push(om);
            } else {
                throw "Transform failed with incompatible operation sequences.";
            }
        }
        return [merge(a1), merge(b1)];
    }
    ot.transform = transform;
})(ot || (ot = {}));
/// <reference path="ot.ts" />
var onde;
(function (onde) {
    var range = ace.require('ace/range');

    function utf8OffsetToPos(lines, off, startrow) {
        if (!startrow) {
            startrow = 0;
        }
        var lastRow = lines.length;
        for (var i = startrow; i < lastRow; i++) {
            var line = lines[i];
            for (var j = 0; off > 0 && j < line.length; j++) {
                var c = line.charCodeAt(j);
                if (c > 0x10000)
                    off -= 4;
else if (c > 0x800)
                    off -= 3;
else if (c > 0x80)
                    off -= 2;
else
                    off -= 1;
            }
            if (--off < 0 || i == lastRow - 1)
                return { row: i, column: j };
        }
        return { row: i - 1, column: j };
    }

    function posToRestIndex(lines, pos) {
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
        return { start: start + startRow, last: last + i - 1 };
    }

    function documentLines(acedoc) {
        // HACK: Reach in and grab $lines private, because it's a hell of a lot more efficient.
        return acedoc['$lines'] || acedoc.getAllLines();
    }

    function deltaToOps(lines, delta) {
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

    function applyOps(acedoc, ops) {
        var lines = documentLines(acedoc);
        var count = ot.count(ops);
        var index = 0, pos = { row: 0, column: 0 }, op;
        var idxr = posToRestIndex(lines, pos);
        if (count[0] + count[1] != idxr.last) {
            throw "The base length must be equal to the document length";
        }
        var cache = { row: 0, at: 0 };
        for (var i = 0; i < ops.length; i++) {
            if (!(op = ops[i])) {
                continue;
            }
            if (typeof op == "string") {
                pos = utf8OffsetToPos(lines, index - cache.at, cache.row);
                cache = { row: pos.row, at: index - pos.column };
                acedoc.insert(pos, op);
                index += ot.utf8len(op);
            } else if (op > 0) {
                index += op;
            } else if (op < 0) {
                var end = utf8OffsetToPos(lines, index - op - cache.at, cache.row);
                pos = utf8OffsetToPos(lines, index - cache.at, cache.row);
                cache = { row: pos.row, at: index - pos.column };
                acedoc.remove(new range.Range(pos.row, pos.column, end.row, end.column));
            }
        }
    }

    var Editor = (function () {
        function Editor(elem, rev, text, opsHandler) {
            var _this = this;
            this.rev = rev;
            this.opsHandler = opsHandler;
            this.status = "";
            this.merge = false;
            this.wait = null;
            this.buf = null;
            elem.textContent = text;

            this.editor = ace.edit(elem);
            this.session = this.editor.getSession();
            this.acedoc = this.session.getDocument();
            this.editor.setTheme("ace/theme/monokai");
            this.editor.getSession().setMode("ace/mode/javascript");

            this.acedoc.on('change', function (e) {
                if (_this.merge) {
                    // Don't re-send changes due to ops being applied.
                    return;
                }

                var delta = e.data;
                var ops = deltaToOps(documentLines(_this.acedoc), delta);
                _this.onChange(ops);
            });
        }
        Editor.prototype.recvOps = function (ops) {
            var res = null;
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
        };

        Editor.prototype.ackOps = function (ops) {
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
        };

        Editor.prototype.onChange = function (ops) {
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
        };
        return Editor;
    })();
    onde.Editor = Editor;
})(onde || (onde = {}));
/// <reference path="api.ts" />
/// <reference path="editor.ts" />
/// <reference path="lib/ace.d.ts" />
/// <reference path="lib/sockjs.d.ts" />
var onde;
(function (onde) {
    var logElem = document.getElementById("log");
    var statusElem = document.getElementById("status");
    var editElem = document.getElementById("doc");

    var editor;
    var sock;
    var userId;

    function log(msg) {
        logElem.value += msg + "\n";
    }

    function setStatus(msg) {
        statusElem.textContent = msg;
    }

    function onOpen() {
        log("connection open");
        setStatus("connected");
    }

    function onClose() {
        log("connection closed");
        setStatus("disconnected");
    }

    function onMessage(e) {
        var rsp = JSON.parse(e.data);
        switch (rsp.Type) {
            case onde.MsgLogin:
                userId = rsp.Login.UserId;
                log("user id: " + userId);
                setStatus("logged in");
                var req = {
                    Type: onde.MsgSubscribe,
                    Subscribe: { DocId: "wut" }
                };
                sock.send(JSON.stringify(req));
                break;

            case onde.MsgSubscribe:
                editor = new onde.Editor(editElem, rsp.Subscribe.Rev, rsp.Subscribe.Doc, function (rev, ops) {
                    var req = {
                        Type: onde.MsgRevise,
                        Revise: { UserId: userId, Rev: rev, Ops: ops }
                    };
                    sock.send(JSON.stringify(req));
                });
                break;

            case onde.MsgRevise:
                var err;
                if (rsp.Revise.UserId == userId) {
                    err = editor.ackOps(rsp.Revise.Ops);
                } else {
                    err = editor.recvOps(rsp.Revise.Ops);
                }
                if (err) {
                    log(err);
                }
                break;
        }
    }

    function getOrigin() {
        return location.protocol + "//" + location.hostname + (location.port ? (":" + location.port) : "");
    }

    function connect() {
        sock = new SockJS(getOrigin() + "/sock", null, {
            debug: true
        });

        sock.onopen = onOpen;
        sock.onclose = onClose;
        sock.onmessage = onMessage;
    }

    function main() {
        connect();
    }
    onde.main = main;
})(onde || (onde = {}));
/// <reference path="../ts/onde.ts" />
onde.main();
