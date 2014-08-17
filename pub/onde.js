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
    // Op represents a single operation.
    // If op is number N it signifies:
    // N > 0: Retain op bytes
    // N < 0: Delete -op bytes
    // B == 0: Noop
    // If op is string S of utf8len N:
    // N > 0: Insert string S
    // N == 0: Noop
    // Ops is a sequence of operations:
    // [5, -2, "text"] // retain 5, delete 2, insert "text"
    // javascript characters use UCS-2 encoding. we need utf-8 byte counts
    function utf8len(str) {
        var i, c, n = 0;
        for (i = 0; i < str.length; i++) {
            c = str.charCodeAt(i);
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
    // An error is returned if the composition failed.
    function compose(a, b) {
        if (!a || !b) {
            return [null, "Compose requires nonempty ops."];
        }
        var acount = count(a), bcount = count(b);
        if (acount[0] + acount[2] != bcount[0] + bcount[1]) {
            return [null, "Compose requires consecutive ops."];
        }
        var res = [], err = null;
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
                return [null, "Compose encountered a short operation sequence."];
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
                alert("This should never have happened.");
            }
        }
        return [merge(res), err];
    }
    ot.compose = compose;

    // Transform returns two operation sequences derived from the concurrent ops a and b.
    // An error is returned if the transformation failed.
    function transform(a, b) {
        if (!a || !b) {
            return [a, b, null];
        }
        var acount = count(a), bcount = count(b);
        if (acount[0] + acount[1] != bcount[0] + bcount[1]) {
            return [null, null, "Transform requires concurrent ops."];
        }
        var a1 = [], b1 = [], err = null;
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
                return [null, null, "Compose encountered a short operation sequence."];
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
                return [null, null, "Transform failed with incompatible operation sequences."];
            }
        }
        return [merge(a1), merge(b1), err];
    }
    ot.transform = transform;
})(ot || (ot = {}));
/// <reference path="ot.ts" />
var onde;
(function (onde) {
    var range = ace.require('ace/range');

    function utf8OffsetToPos(lines, off, startrow) {
        if (!startrow)
            startrow = 0;
        var i, line, j, c, lastRow = lines.length;
        for (i = startrow; i < lastRow; i++) {
            line = lines[i];
            for (j = 0; off > 0 && j < line.length; j++) {
                c = line.charCodeAt(j);
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
        var i, c, lastRow = lines.length;
        var startRow = Math.min(pos.row, lastRow);
        for (i = 0; i < lastRow; i++) {
            c = ot.utf8len(lines[i]);
            last += c;
            if (i < startRow) {
                start += c;
            } else if (i == startRow) {
                start += ot.utf8len(lines[i].slice(0, pos.column));
            }
        }
        return { start: start + startRow, last: last + i - 1 };
    }

    function joinLines(lines) {
        var res = "";
        for (var i = 0; i < lines.length; i++) {
            res += lines[i] + "\n";
        }
        return res;
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
                var text = joinLines(delta.lines);
                ops.push(text);
                idxr.last -= ot.utf8len(text);
                break;
            default:
                return [];
        }
        if (idxr.start)
            ops.unshift(idxr.start);
        if (idxr.last - idxr.start > 0)
            ops.push(idxr.last - idxr.start);
        return ops;
    }

    function applyOps(acedoc, ops) {
        var lines = acedoc.$lines || acedoc.getAllLines();
        var count = ot.count(ops);
        var index = 0, pos = { row: 0, column: 0 }, op;
        var idxr = posToRestIndex(lines, pos);
        if (count[0] + count[1] != idxr.last) {
            return "The base length must be equal to the document length";
        }
        var cache = { row: 0, at: 0 };
        for (var i = 0; i < ops.length; i++) {
            if (!(op = ops[i]))
                continue;
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
        return null;
    }

    var Doc = (function () {
        function Doc(elem, rev, text, opsHandler) {
            var _this = this;
            this.rev = rev;
            this.opsHandler = opsHandler;
            this.status = "";
            this.wait = null;
            this.merge = false;
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

                // HACK: Reach in and grab $lines private, because it's a hell of a lot more efficient.
                var lines = _this.acedoc['$lines'] || _this.acedoc.getAllLines();
                var ops = deltaToOps(lines, e.data);
                _this.onChange(ops);
            });
        }
        Doc.prototype.recvOps = function (ops) {
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
            var err = applyOps(this.acedoc, ops);
            this.merge = false;
            if (err === null) {
                ++this.rev;
                this.status = "received";
            }
            return err;
        };

        Doc.prototype.ackOps = function (ops) {
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
            } else {
                return "no pending operation";
            }
            return null;
        };

        Doc.prototype.onChange = function (ops) {
            if (this.buf !== null) {
                var res = ot.compose(this.buf, ops);
                if (res[1] !== null) {
                    console.log("compose error", res);
                    return;
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
        return Doc;
    })();
    onde.Doc = Doc;
})(onde || (onde = {}));
/// <reference path="editor.ts" />
/// <reference path="lib/ace.d.ts" />
/// <reference path="lib/sockjs.d.ts" />
var onde;
(function (onde) {
    var logElem = document.getElementById("log");
    var statusElem = document.getElementById("status");

    function log(msg) {
        logElem.value += msg + "\n";
    }

    function setStatus(msg) {
        statusElem.textContent = msg;
    }

    var docElem = document.getElementById("doc");
    var doc;
    var sock;
    var userId;

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
            case "login":
                userId = rsp.Login.UserId;
                log("user id: " + userId);
                setStatus("logged in");
                sock.send(JSON.stringify({
                    Type: "subscribe",
                    Subscribe: { DocId: "wut" }
                }));
                break;

            case "subscribe":
                doc = new onde.Doc(docElem, rsp.Subscribe.Rev, rsp.Subscribe.Doc, function (rev, ops) {
                    sock.send(JSON.stringify({
                        Type: "revise",
                        Revise: { UserId: userId, Rev: rev, Ops: ops }
                    }));
                });
                break;

            case "revise":
                var err;
                if (rsp.Revise.UserId == userId) {
                    err = doc.ackOps(rsp.Revise.Ops);
                } else {
                    err = doc.recvOps(rsp.Revise.Ops);
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
