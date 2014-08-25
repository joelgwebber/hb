var onde;
(function (onde) {
    // Message types.
    onde.MsgLogin = "login";
    onde.MsgSubscribeDoc = "subscribedoc";
    onde.MsgUnsubscribeDoc = "unsubscribedoc";
    onde.MsgRevise = "revise";
    onde.MsgSubscribeSearch = "subscribesearch";
    onde.MsgUnsubscribeSearch = "unsubscribesearch";
    onde.MsgSearchResults = "searchresults";
    onde.MsgCreateDoc = "createdoc";
    onde.MsgError = "error";
})(onde || (onde = {}));
var onde;
(function (onde) {
    /// <reference path="lib/sockjs.d.ts" />
    // TODO:
    // - Implement outgoing message queue.
    // - Re-establish connection automatically.
    // - Track acknowledged requests.
    (function (connection) {
        var DocSubscription = (function () {
            function DocSubscription(docId, _onsubscribe, _onrevision, _onack) {
                this.docId = docId;
                this._onsubscribe = _onsubscribe;
                this._onrevision = _onrevision;
                this._onack = _onack;
                this._subId = ++_curSubId;
            }
            DocSubscription.prototype.revise = function (rev, ops) {
                var req = {
                    Type: onde.MsgRevise,
                    Revise: { ConnId: connId, SubId: this._subId, DocId: this.docId, Rev: rev, Ops: ops }
                };
                send(req);
            };

            DocSubscription.prototype.unsubscribe = function () {
                var req = {
                    Type: onde.MsgUnsubscribeDoc,
                    UnsubscribeDoc: { SubId: this._subId }
                };
                send(req);
            };
            return DocSubscription;
        })();
        connection.DocSubscription = DocSubscription;

        var SearchSubscription = (function () {
            function SearchSubscription(query, _onsearchresults) {
                this.query = query;
                this._onsearchresults = _onsearchresults;
            }
            SearchSubscription.prototype.unsubscribe = function () {
                var subs = searchSubs[this.query];
                subs.splice(subs.indexOf(this), 1);
                if (subs.length == 0) {
                    var req = {
                        Type: onde.MsgUnsubscribeSearch,
                        UnsubscribeSearch: { Query: this.query }
                    };
                    send(req);
                    delete searchSubs[this.query];
                }
            };
            return SearchSubscription;
        })();
        connection.SearchSubscription = SearchSubscription;

        var _curSubId = 0;
        var _curCreateId = 0;

        var sock;
        var connId;
        var docSubs = {};
        var searchSubs = {};
        var onCreates = {};

        connection.onOpen;
        connection.onClose;
        connection.onLogin;

        function connect() {
            sock = new SockJS(getOrigin() + "/sock", null, {
                debug: true
            });

            sock.onopen = function () {
                if (connection.onOpen) {
                    connection.onOpen();
                }
            };
            sock.onclose = function () {
                sock = null;
                connId = null;
                if (connection.onClose) {
                    connection.onClose();
                }
            };
            sock.onmessage = onMessage;
        }
        connection.connect = connect;

        function login(userId) {
            var req = {
                Type: onde.MsgLogin,
                Login: { UserId: userId }
            };
            send(req);
        }
        connection.login = login;

        function subscribeDoc(docId, onSubscribe, onRevision, onAck) {
            var sub = new DocSubscription(docId, onSubscribe, onRevision, onAck);
            docSubs[docSubKey(docId, sub._subId)] = sub;

            var req = {
                Type: onde.MsgSubscribeDoc,
                SubscribeDoc: { DocId: docId, SubId: sub._subId }
            };
            send(req);
            return sub;
        }
        connection.subscribeDoc = subscribeDoc;

        function subscribeSearch(query, onSearchResults) {
            if (!(query in searchSubs)) {
                searchSubs[query] = [];
                var req = {
                    Type: onde.MsgSubscribeSearch,
                    SubscribeSearch: { Query: query }
                };
                send(req);
            }

            var sub = new SearchSubscription(query, onSearchResults);
            searchSubs[query].push(sub);
            return sub;
        }
        connection.subscribeSearch = subscribeSearch;

        function createDoc(onCreated) {
            var id = ++_curCreateId;
            onCreates[id] = onCreated;
            var req = {
                Type: onde.MsgCreateDoc,
                CreateDoc: { CreateId: id }
            };
            send(req);
        }
        connection.createDoc = createDoc;

        function getOrigin() {
            return location.protocol + "//" + location.hostname + (location.port ? (":" + location.port) : "");
        }

        function handleLogin(rsp) {
            connId = rsp.ConnId;
            if (connection.onLogin) {
                connection.onLogin();
            }
        }

        function handleSubscribeDoc(rsp) {
            var sub = docSubs[docSubKey(rsp.DocId, rsp.SubId)];
            sub._onsubscribe(rsp);
        }

        function handleRevise(rsp) {
            for (var i = 0; i < rsp.SubIds.length; ++i) {
                var sub = docSubs[docSubKey(rsp.DocId, rsp.SubIds[0])];
                if (!sub) {
                    onde.log("got results for doc " + rsp.DocId + " with no local subscription");
                    continue;
                }

                if ((rsp.OrigConnId == connId) && (rsp.OrigSubId == sub._subId)) {
                    sub._onack(rsp);
                } else {
                    sub._onrevision(rsp);
                }
            }
        }

        function handleSearchResults(rsp) {
            var subs = searchSubs[rsp.Query];
            if (!subs) {
                onde.log("got results for search " + rsp.Query + " with no local subscription");
                return;
            }

            for (var i = 0; i < subs.length; ++i) {
                subs[i]._onsearchresults(rsp);
            }
        }

        function handleCreateDoc(rsp) {
            var onCreate = onCreates[rsp.CreateId];
            if (!onCreate) {
                onde.log("got unmatched create response " + rsp.CreateId);
                return;
            }

            delete onCreates[rsp.CreateId];
            onCreate(rsp);
        }

        function docSubKey(docId, subId) {
            return docId + ":" + subId;
        }

        function send(req) {
            onde.log(req);
            sock.send(JSON.stringify(req));
        }

        function onMessage(e) {
            var rsp = JSON.parse(e.data);
            onde.log(rsp);
            switch (rsp.Type) {
                case onde.MsgLogin:
                    handleLogin(rsp.Login);
                    break;

                case onde.MsgSubscribeDoc:
                    handleSubscribeDoc(rsp.SubscribeDoc);
                    break;

                case onde.MsgUnsubscribeDoc:
                    break;

                case onde.MsgRevise:
                    handleRevise(rsp.Revise);
                    break;

                case onde.MsgSubscribeSearch:
                    break;

                case onde.MsgSearchResults:
                    handleSearchResults(rsp.SearchResults);
                    break;

                case onde.MsgUnsubscribeSearch:
                    break;

                case onde.MsgCreateDoc:
                    handleCreateDoc(rsp.CreateDoc);
                    break;

                case onde.MsgError:
                    onde.log(rsp.Error.Msg);
                    break;
            }
        }
    })(onde.connection || (onde.connection = {}));
    var connection = onde.connection;
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
// Some parts adapted from github.com/mb0/lab:
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//
/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="lib/ace.d.ts" />
var onde;
(function (onde) {
    var Editor = (function () {
        function Editor() {
            var _this = this;
            this._status = "";
            this._merge = false;
            this._wait = null;
            this._buf = null;
            this._rev = -1;
            this._elem = document.createElement("div");
            this._elem.className = "Editor";

            this._ace = ace.edit(this._elem);
            this._session = this._ace.getSession();
            this._acedoc = this._session.getDocument();
            this._ace.setTheme("ace/theme/textmate");
            this._ace.setHighlightActiveLine(false);
            this._ace.setShowPrintMargin(false);
            this._session.setMode("ace/mode/markdown");

            this._acedoc.on('change', function (e) {
                if (_this._rev == -1 || _this._merge) {
                    // Don't re-send changes due to ops being applied (or if the doc's not yet loaded).
                    return;
                }

                var delta = e.data;
                var ops = deltaToOps(documentLines(_this._acedoc), delta);
                _this.onChange(ops);
            });
        }
        Editor.prototype.elem = function () {
            return this._elem;
        };

        Editor.prototype.loadDoc = function (docId) {
            var _this = this;
            if (this._sub) {
                this.unsubscribe();
            }

            this._sub = onde.connection.subscribeDoc(docId, function (rsp) {
                _this._acedoc.setValue(rsp.Body);
                _this._rev = rsp.Rev;
            }, function (rsp) {
                _this.recvOps(rsp.Ops);
            }, function (rsp) {
                _this.ackOps(rsp.Ops);
            });
        };

        Editor.prototype.unsubscribe = function () {
            // TODO: Check for outgoing ops and make sure they go to the server
            // (may need to hoist op management out to a detachable class).
            this._status = "";
            this._merge = false;
            this._wait = null;
            this._buf = null;
            this._rev = -1;
            this._sub.unsubscribe();
        };

        Editor.prototype.recvOps = function (ops) {
            var res = null;
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
            ++this._rev;
            this._status = "received";
        };

        Editor.prototype.ackOps = function (ops) {
            var rev = this._rev + 1;
            if (this._buf !== null) {
                this._wait = this._buf;
                this._buf = null;
                this._rev = rev;
                this._status = "waiting";
                this._sub.revise(rev, this._wait);
            } else if (this._wait !== null) {
                this._wait = null;
                this._rev = rev;
                this._status = "";
            }
        };

        Editor.prototype.onChange = function (ops) {
            if (this._buf !== null) {
                this._buf = ot.compose(this._buf, ops);
            } else if (this._wait !== null) {
                this._buf = ops;
            } else {
                this._wait = ops;
                this._status = "waiting";
                this._sub.revise(this._rev, ops);
            }
        };
        return Editor;
    })();
    onde.Editor = Editor;

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
})(onde || (onde = {}));
/// <reference path="connection.ts" />
var onde;
(function (onde) {
    var SearchBox = (function () {
        function SearchBox() {
            var _this = this;
            this._elem = document.createElement("div");
            this._elem.className = "SearchBox";
            this._input = document.createElement("input");
            this._input.className = "entry";
            this._results = document.createElement("div");
            this._results.className = "results";

            this._elem.appendChild(this._input);
            this._elem.appendChild(this._results);

            this._input.onchange = function (e) {
                _this.search(_this._input.value);
            };
        }
        SearchBox.prototype.elem = function () {
            return this._elem;
        };

        SearchBox.prototype.search = function (query) {
            var _this = this;
            if (this._sub) {
                if (this._sub.query == query) {
                    return;
                }
                this._sub.unsubscribe();
            }

            this._sub = onde.connection.subscribeSearch(query, function (rsp) {
                _this.render(rsp);
            });
        };

        SearchBox.prototype.render = function (rsp) {
            this._results.innerHTML = "";
            for (var i = 0; i < rsp.Results.length; ++i) {
                this._results.appendChild(this.createItem(rsp.Results[i]));
            }
        };

        SearchBox.prototype.createItem = function (result) {
            var _this = this;
            var item = document.createElement("div");
            item.className = "item";
            item.textContent = result.Body;
            item.onclick = function (e) {
                _this.selectItem(result.DocId);
            };
            return item;
        };

        SearchBox.prototype.selectItem = function (docId) {
            if (this.onSelectDoc) {
                this.onSelectDoc(docId);
            }
        };
        return SearchBox;
    })();
    onde.SearchBox = SearchBox;
})(onde || (onde = {}));
/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="editor.ts" />
/// <reference path="search.ts" />
var onde;
(function (onde) {
    var DEBUG = true;

    var searchBox;
    var editor;
    var statusElem;
    var createElem;

    function main() {
        searchBox = new onde.SearchBox();
        document.body.appendChild(searchBox.elem());

        editor = new onde.Editor();
        document.body.appendChild(editor.elem());

        statusElem = document.createElement("div");
        statusElem.className = "Status";
        document.body.appendChild(statusElem);

        createElem = document.createElement("button");
        createElem.className = "Create";
        createElem.textContent = "create";
        document.body.appendChild(createElem);

        searchBox.onSelectDoc = function (docId) {
            editor.loadDoc(docId);
        };

        createElem.onclick = function (e) {
            onde.connection.createDoc(function (rsp) {
                editor.loadDoc(rsp.DocId);
            });
        };

        onde.connection.onOpen = onOpen;
        onde.connection.onClose = onClose;
        onde.connection.onLogin = onLogin;
        onde.connection.connect();
    }
    onde.main = main;

    function log(msg) {
        if (DEBUG) {
            console.log(msg);
        }
    }
    onde.log = log;

    function setStatus(msg) {
        statusElem.textContent = msg;
    }

    function onOpen() {
        log("connection open");
        setStatus("connected");
        onde.connection.login("joel");
    }

    function onClose() {
        log("connection closed; refresh to reconnect for now");
        //    log("connection closed; reconnecting in 1s");
        //    setStatus("disconnected");
        //    setTimeout(connection.connect, 1000);
    }

    function onLogin() {
        setStatus("logged in");
    }
})(onde || (onde = {}));
/// <reference path="../ts/onde.ts" />
onde.main();
