var onde;
(function (onde) {
    // Message types.
    onde.MsgLogin = "login";
    onde.MsgSubscribeCard = "subscribecard";
    onde.MsgUnsubscribeCard = "unsubscribecard";
    onde.MsgRevise = "revise";
    onde.MsgSubscribeSearch = "subscribesearch";
    onde.MsgUnsubscribeSearch = "unsubscribesearch";
    onde.MsgSearchResults = "searchresults";
    onde.MsgCreateCard = "createcard";
    onde.MsgError = "error";
})(onde || (onde = {}));
/// <reference path="lib/sockjs.d.ts" />
// TODO:
// - Implement outgoing message queue.
// - Re-establish connection automatically (reestablish subscriptions so UI doesn't have to).
// - Track acknowledged requests.
var onde;
(function (onde) {
    var LOG_MESSAGES = false;

    var CardSubscription = (function () {
        function CardSubscription(_conn, cardId, _onsubscribe, _onrevision, _onack) {
            this._conn = _conn;
            this.cardId = cardId;
            this._onsubscribe = _onsubscribe;
            this._onrevision = _onrevision;
            this._onack = _onack;
            this._subId = ++_conn._curSubId;
        }
        CardSubscription.prototype.revise = function (rev, change) {
            var req = {
                Type: onde.MsgRevise,
                Revise: { ConnId: this._conn.connId(), SubId: this._subId, CardId: this.cardId, Rev: rev, Change: change }
            };
            this._conn._send(req);
        };

        CardSubscription.prototype.unsubscribe = function () {
            var req = {
                Type: onde.MsgUnsubscribeCard,
                UnsubscribeCard: { SubId: this._subId }
            };
            this._conn._send(req);
        };
        return CardSubscription;
    })();
    onde.CardSubscription = CardSubscription;

    var SearchSubscription = (function () {
        function SearchSubscription(_conn, query, _onsearchresults) {
            this._conn = _conn;
            this.query = query;
            this._onsearchresults = _onsearchresults;
        }
        SearchSubscription.prototype.unsubscribe = function () {
            var subs = this._conn._searchSubs[this.query];
            subs.splice(subs.indexOf(this), 1);
            if (subs.length == 0) {
                var req = {
                    Type: onde.MsgUnsubscribeSearch,
                    UnsubscribeSearch: { Query: this.query }
                };
                this._conn._send(req);
                delete this._conn._searchSubs[this.query];
            }
        };
        return SearchSubscription;
    })();
    onde.SearchSubscription = SearchSubscription;

    var Connection = (function () {
        function Connection(_ctx) {
            this._ctx = _ctx;
            this._onCreates = {};
            this._cardSubs = {};
            this._searchSubs = {};
            this._curSubId = 0;
            this._curCreateId = 0;
        }
        Connection.prototype.connect = function () {
            var _this = this;
            this._sock = new SockJS(this.getOrigin() + "/sock", null, {
                debug: true
            });

            this._sock.onopen = function () {
                if (_this.onOpen) {
                    _this.onOpen();
                }
            };
            this._sock.onclose = function () {
                _this._sock = null;
                _this.connId = null;
                if (_this.onClose) {
                    _this.onClose();
                }
            };
            this._sock.onmessage = function (e) {
                _this.onMessage(e);
            };
        };

        Connection.prototype.connId = function () {
            return this._connId;
        };

        Connection.prototype.login = function (userId, password) {
            var req = {
                Type: onde.MsgLogin,
                Login: {
                    UserId: userId,
                    Password: password
                }
            };
            this._send(req);
        };

        Connection.prototype.subscribeCard = function (cardId, onSubscribe, onRevision, onAck) {
            var sub = new CardSubscription(this, cardId, onSubscribe, onRevision, onAck);
            this._cardSubs[cardSubKey(cardId, sub._subId)] = sub;

            var req = {
                Type: onde.MsgSubscribeCard,
                SubscribeCard: { CardId: cardId, SubId: sub._subId }
            };
            this._send(req);
            return sub;
        };

        Connection.prototype.subscribeSearch = function (query, onSearchResults) {
            if (!(query in this._searchSubs)) {
                this._searchSubs[query] = [];
                var req = {
                    Type: onde.MsgSubscribeSearch,
                    SubscribeSearch: { Query: query }
                };
                this._send(req);
            }

            var sub = new SearchSubscription(this, query, onSearchResults);
            this._searchSubs[query].push(sub);
            return sub;
        };

        Connection.prototype.createCard = function (props, onCreated) {
            var id = ++this._curCreateId;
            this._onCreates[id] = onCreated;
            var req = {
                Type: onde.MsgCreateCard,
                CreateCard: {
                    CreateId: id,
                    Props: props
                }
            };
            this._send(req);
        };

        Connection.prototype._send = function (req) {
            if (LOG_MESSAGES) {
                this._ctx.log(req);
            }
            this._sock.send(JSON.stringify(req));
        };

        Connection.prototype.getOrigin = function () {
            return location.protocol + "//" + location.hostname + (location.port ? (":" + location.port) : "");
        };

        Connection.prototype.handleLogin = function (rsp) {
            this._connId = rsp.ConnId;
            if (this.onLogin) {
                this.onLogin();
            }
        };

        Connection.prototype.handleSubscribeCard = function (rsp) {
            var sub = this._cardSubs[cardSubKey(rsp.CardId, rsp.SubId)];
            sub._onsubscribe(rsp);
        };

        Connection.prototype.handleRevise = function (rsp) {
            for (var i = 0; i < rsp.SubIds.length; ++i) {
                var sub = this._cardSubs[cardSubKey(rsp.CardId, rsp.SubIds[0])];
                if (!sub) {
                    this._ctx.log("got results for card " + rsp.CardId + " with no local subscription");
                    continue;
                }

                if ((rsp.OrigConnId == this._connId) && (rsp.OrigSubId == sub._subId)) {
                    sub._onack(rsp);
                } else {
                    sub._onrevision(rsp);
                }
            }
        };

        Connection.prototype.handleSearchResults = function (rsp) {
            var subs = this._searchSubs[rsp.Query];
            if (!subs) {
                this._ctx.log("got results for search " + rsp.Query + " with no local subscription");
                return;
            }

            for (var i = 0; i < subs.length; ++i) {
                subs[i]._onsearchresults(rsp);
            }
        };

        Connection.prototype.handleCreateCard = function (rsp) {
            var onCreate = this._onCreates[rsp.CreateId];
            if (!onCreate) {
                this._ctx.log("got unmatched create response " + rsp.CreateId);
                return;
            }

            delete this._onCreates[rsp.CreateId];
            onCreate(rsp);
        };

        Connection.prototype.onMessage = function (e) {
            var rsp = JSON.parse(e.data);
            if (LOG_MESSAGES) {
                this._ctx.log(rsp);
            }
            switch (rsp.Type) {
                case onde.MsgLogin:
                    this.handleLogin(rsp.Login);
                    break;

                case onde.MsgSubscribeCard:
                    this.handleSubscribeCard(rsp.SubscribeCard);
                    break;

                case onde.MsgUnsubscribeCard:
                    break;

                case onde.MsgRevise:
                    this.handleRevise(rsp.Revise);
                    break;

                case onde.MsgSubscribeSearch:
                    break;

                case onde.MsgSearchResults:
                    this.handleSearchResults(rsp.SearchResults);
                    break;

                case onde.MsgUnsubscribeSearch:
                    break;

                case onde.MsgCreateCard:
                    this.handleCreateCard(rsp.CreateCard);
                    break;

                case onde.MsgError:
                    this._ctx.log(rsp.Error.Msg);
                    break;
            }
        };
        return Connection;
    })();
    onde.Connection = Connection;

    function cardSubKey(cardId, subId) {
        return cardId + ":" + subId;
    }
})(onde || (onde = {}));
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var onde;
(function (onde) {
    function _templateId(id) {
        return '|' + id;
    }

    // A view whose instances can be stamped out from a template DOM fragment.
    //
    // The source fragment must already exist in the document, identified by an id of the
    // form '|TemplateName' (typically these would be in a display:none container to avoid
    // rendering the source templates).
    var TemplateView = (function () {
        function TemplateView(id) {
            var elem = document.getElementById(_templateId(id));
            if (!elem) {
                throw 'No template with id "|' + id + '" found';
            }
            this._elem = elem.cloneNode(true);
            this._elem.removeAttribute('id');
        }
        TemplateView.prototype.elem = function () {
            return this._elem;
        };

        // Gets the child element with the given css selector.
        //
        // There must be precisely one child element at the given selector. It is strongly
        // recommended that all children that a view instance needs be retrieved *before*
        // adding any new children to its DOM structure. Otherwise, name conflicts in child
        // templates can lead to hard-to-debug behavior.
        TemplateView.prototype.$ = function (selector) {
            var children = this.elem().querySelectorAll(selector);
            if (children.length != 1) {
                throw 'Found ' + children.length + ' elements for selector ' + selector + ' (expected 1)';
            }
            return children[0];
        };

        // Determines whether this template has a child with the given class name.
        TemplateView.prototype.hasChild = function (selector) {
            return this.elem().querySelectorAll(selector).length == 1;
        };
        return TemplateView;
    })();
    onde.TemplateView = TemplateView;

    // Very simple dialog box. Simply automatically adds and removes itself to the container
    // element passed to its constructor. This will typically be used with a "fill" style --
    // e.g., { position:absolute; left-top-right-bottom:0 }.
    //
    // This class will look for a child with the selector .close, and if found will use
    // it as a close button.
    //
    // TODO(jgw): Implement auto-hide tracking here so we can make it easy to ensure that
    // dialogs close cleanly on UI state transitions.
    var Dialog = (function (_super) {
        __extends(Dialog, _super);
        function Dialog(id, _container) {
            if (typeof _container === "undefined") { _container = null; }
            _super.call(this, id);
            this._container = _container;
            this._showGlass = false;
            this._showing = false;

            if (this._container == null) {
                this._container = document.body;
                this._showGlass = true;
            }
        }
        Dialog.prototype.showing = function () {
            return this._showing;
        };

        Dialog.prototype.show = function () {
            var _this = this;
            if (this._showing) {
                return;
            }
            this._showing = true;

            if (this._showGlass) {
                this._glass = document.createElement('div');
                this._glass.className = 'DialogGlass';
                this._container.appendChild(this._glass);
                this._glass.onclick = function () {
                    _this.requestHide();
                };
            }
            this._container.appendChild(this.elem());
        };

        Dialog.prototype.hide = function () {
            if (!this._showing) {
                return;
            }
            this._showing = false;

            if (this._container.contains(this.elem()))
                this._container.removeChild(this.elem());
            if (this._showGlass) {
                this._container.removeChild(this._glass);
            }
        };

        Dialog.prototype.requestHide = function () {
            this.hide();
        };
        return Dialog;
    })(TemplateView);
    onde.Dialog = Dialog;
})(onde || (onde = {}));
/// <reference path="connection.ts" />
/// <reference path="views.ts" />
var onde;
(function (onde) {
    var SearchCard = (function (_super) {
        __extends(SearchCard, _super);
        function SearchCard(result) {
            _super.call(this, "SearchCard");
            this.$(".title").textContent = result.Title;
            this.$(".body").textContent = result.Body;
        }
        return SearchCard;
    })(onde.TemplateView);

    var SearchBox = (function (_super) {
        __extends(SearchBox, _super);
        function SearchBox(_ctx) {
            var _this = this;
            _super.call(this, "SearchBox");
            this._ctx = _ctx;
            this._input = this.$(".entry");
            this._results = this.$(".results");
            (this.elem()).onsubmit = function (e) {
                _this.search(_this._input.value);
                e.preventDefault();
            };
        }
        SearchBox.prototype.curQuery = function () {
            if (!this._sub) {
                return "";
            }
            return this._sub.query;
        };

        SearchBox.prototype.search = function (query) {
            var _this = this;
            this._input.value = query;
            if (this._sub) {
                if (this._sub.query == query) {
                    return;
                }
                this._sub.unsubscribe();
            }

            this._sub = this._ctx.connection().subscribeSearch(query, function (rsp) {
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
            var item = new SearchCard(result);
            item.elem().onclick = function (e) {
                _this.selectItem(result.CardId);
            };
            return item.elem();
        };

        SearchBox.prototype.selectItem = function (cardId) {
            if (this.onSelectCard) {
                this.onSelectCard(cardId);
            }
        };
        return SearchBox;
    })(onde.TemplateView);
    onde.SearchBox = SearchBox;
})(onde || (onde = {}));
/// <reference path="connection.ts" />
var onde;
(function (onde) {
    var CommentList = (function () {
        function CommentList(_ctx) {
            var _this = this;
            this._ctx = _ctx;
            this._elem = document.createElement("div");
            this._elem.className = "CommentList";

            this._results = document.createElement("div");
            this._results.className = "results";
            this._elem.appendChild(this._results);

            var editor = document.createElement("textarea");
            editor.setAttribute("rows", "4");
            this._elem.appendChild(editor);

            var editContainer = document.createElement("div");
            editContainer.className = "editor";
            this._elem.appendChild(editContainer);
            editContainer.appendChild(editor);

            var createBtn = document.createElement("button");
            createBtn.className = "create";
            createBtn.textContent = "comment";
            createBtn.onclick = function () {
                _ctx.connection().createCard({
                    type: "comment",
                    target: _this._cardId,
                    body: editor.value
                }, function (rsp) {
                    editor.value = "";
                });
            };
            this._elem.appendChild(createBtn);
        }
        CommentList.prototype.elem = function () {
            return this._elem;
        };

        CommentList.prototype.setCardId = function (cardId) {
            var _this = this;
            var query = "prop_type: comment AND prop_target:" + cardId;
            if (this._sub) {
                if (this._sub.query == query) {
                    return;
                }
                this._sub.unsubscribe();
            }

            this._cardId = cardId;
            this._sub = this._ctx.connection().subscribeSearch(query, function (rsp) {
                _this.render(rsp);
            });
        };

        CommentList.prototype.render = function (rsp) {
            this._results.innerHTML = "";
            for (var i = 0; i < rsp.Results.length; ++i) {
                this._results.appendChild(this.createItem(rsp.Results[i]));
            }
        };

        CommentList.prototype.createItem = function (result) {
            var item = document.createElement("div");
            item.className = "item";
            item.textContent = result.Body;
            return item;
        };
        return CommentList;
    })();
    onde.CommentList = CommentList;
})(onde || (onde = {}));
/// <reference path="connection.ts" />
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
    // Calculates the number of ucs2 values required to encode 'len' utf8 bytes starting at 'pos' in 's'.
    function ucs2len(str, pos, len) {
        var out = 0;
        while (len > 0) {
            var c = str.charCodeAt(pos++);
            if (c > 0x10000)
                len -= 4;
else if (c > 0x800)
                len -= 3;
else if (c > 0x80)
                len -= 2;
else
                len -= 1;
            out++;
        }
        if (len != 0) {
            throw "misaligned byte length";
        }
        return out;
    }
    ot.ucs2len = ucs2len;

    // Calculates the length of 'str' in utf8 bytes.
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
    // Client-side card abstraction. Maintains subscription to server-side card, along with
    // OT bookkeeping. Also maintains the property list at the beginning of the card, hiding it
    // from users so they don't see it as part of the card body.
    //
    // A new Card class must be instantiated for each doc-id, and release() must
    // be called when discarding an instance (otherwise it will leak subscriptions until the connection
    // is lost).
    var Card = (function () {
        function Card(ctx, _docId) {
            var _this = this;
            this._docId = _docId;
            //    private _status = "";
            this._wait = {};
            this._buf = {};
            this._props = {};
            this._rev = -1;
            this._bindings = {};
            this._sub = ctx.connection().subscribeCard(_docId, function (rsp) {
                _this._rev = rsp.Rev;
                _this._props = rsp.Props;
                _this.subscribed();
            }, function (rsp) {
                _this.recvOps(rsp.Change);
            }, function (rsp) {
                _this.ackOps(rsp.Change);
            });
        }
        Card.prototype.bind = function (prop, onReady, onChange) {
            var _this = this;
            if (prop in this._bindings) {
                throw "multiple bindings to " + prop;
            }

            var binding = {
                onReady: onReady,
                onChange: onChange,
                revise: function (ops) {
                    _this.revise({ Prop: prop, Ops: ops });
                },
                release: function () {
                    binding.revise = null;
                    binding.release = null;
                    delete _this._bindings[prop];
                }
            };
            this._bindings[prop] = binding;

            if (this._rev >= 0) {
                onReady(this.prop(prop));
                binding.onReady = null;
            }

            return binding;
        };

        // The current card revision. Any mutation to the card will bump this value.
        Card.prototype.revision = function () {
            return this._rev;
        };

        // The card's given property, by name.
        // Non-existent properties return "". Revisions automatically bring new properties into existence.
        Card.prototype.prop = function (key) {
            if (!(key in this._props)) {
                return "";
            }
            return this._props[key];
        };

        // Must be called when done with a card instance.
        Card.prototype.release = function () {
            // TODO: Check for outgoing ops and make sure they go to the server.
            //      this._status = "";
            this._wait = {};
            this._buf = {};
            this._rev = -1;
            this._sub.unsubscribe();
        };

        Card.prototype.subscribed = function () {
            for (var prop in this._bindings) {
                var binding = this._bindings[prop];
                if (binding.onReady) {
                    binding.onReady(this.prop(prop));
                    binding.onReady = null;
                }
            }
        };

        // Revise this card with OT ops (as defined in ot.ts).
        Card.prototype.revise = function (change) {
            if (this._buf[change.Prop]) {
                this._buf[change.Prop] = ot.compose(this._buf[change.Prop], change.Ops);
            } else if (this._wait[change.Prop]) {
                this._buf[change.Prop] = change.Ops;
            } else {
                this._wait[change.Prop] = change.Ops;

                //        this._status = "waiting";
                this._sub.revise(this._rev, change);
            }
        };

        Card.prototype.recvOps = function (change) {
            var res = null;
            if (this._wait[change.Prop]) {
                res = ot.transform(change.Ops, this._wait[change.Prop]);
                change.Ops = res[0];
                this._wait[change.Prop] = res[1];
            }
            if (this._buf[change.Prop]) {
                res = ot.transform(change.Ops, this._buf[change.Prop]);
                change.Ops = res[0];
                this._buf[change.Prop] = res[1];
            }

            this.apply(change);
            ++this._rev;
            //      this._status = "received";
        };

        Card.prototype.ackOps = function (change) {
            this.updateProp(change);
            ++this._rev;

            if (this._buf[change.Prop]) {
                this._wait[change.Prop] = this._buf[change.Prop];
                this._buf = {};

                //        this._status = "waiting";
                this._sub.revise(this._rev, {
                    Prop: change.Prop,
                    Ops: this._wait[change.Prop]
                });
            } else if (this._wait[change.Prop]) {
                this._wait[change.Prop] = null;
                //        this._status = "";
            }
        };

        Card.prototype.apply = function (change) {
            this.updateProp(change);
            var binding = this._bindings[change.Prop];
            if (binding) {
                binding.onChange(change.Ops);
            }
        };

        Card.prototype.updateProp = function (change) {
            var pos = 0;
            var text = "";
            for (var i = 0; i < change.Ops.length; ++i) {
                var op = change.Ops[i];
                if (typeof op == "string") {
                    text = text + op;
                } else if (op > 0) {
                    var len = ot.ucs2len(this._props[change.Prop], pos, op);
                    text += this._props[change.Prop].slice(pos, pos + len);
                    pos += len;
                } else if (op < 0) {
                    var len = ot.ucs2len(this._props[change.Prop], pos, -op);
                    pos += len;
                }
            }
            this._props[change.Prop] = text;
        };
        return Card;
    })();
    onde.Card = Card;
})(onde || (onde = {}));
// Some parts adapted from github.com/mb0/lab:
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//
/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="card.ts" />
/// <reference path="lib/ace.d.ts" />
var onde;
(function (onde) {
    // Abstract base class for simple editors that always set the entire value at once.
    var BasicEditor = (function () {
        function BasicEditor(_elem) {
            this._elem = _elem;
        }
        BasicEditor.prototype.elem = function () {
            return this._elem;
        };

        BasicEditor.prototype.bind = function (card, prop) {
            var _this = this;
            this._card = card;
            this._prop = prop;

            this.unbind();

            this._binding = card.bind(prop, function (value) {
                _this._onValueChange(value);
            }, function (ops) {
                _this._onValueChange(card.prop(prop));
            });
        };

        BasicEditor.prototype.unbind = function () {
            if (this._binding) {
                this._binding.release();
                this._binding = null;
            }
        };

        BasicEditor.prototype._setValue = function (value) {
            var len = this._card.prop(this._prop).length;
            this._binding.revise([0, -len, value]);
        };

        BasicEditor.prototype._onValueChange = function (value) {
            throw "abstract";
        };
        return BasicEditor;
    })();
    onde.BasicEditor = BasicEditor;

    var SelectEditor = (function (_super) {
        __extends(SelectEditor, _super);
        function SelectEditor(options, captions, elem) {
            if (typeof elem === "undefined") { elem = null; }
            var _this = this;
            _super.call(this, elem || document.createElement("select"));
            if (options.length != captions.length) {
                throw "options/captions size mismatch";
            }
            for (var i = 0; i < options.length; ++i) {
                var option = document.createElement("option");
                option.value = options[i];
                option.text = captions[i];
                this.elem().appendChild(option);
            }

            this.elem().onchange = function (e) {
                _this._setValue(_this.elem().value);
            };
        }
        SelectEditor.prototype.elem = function () {
            return _super.prototype.elem.call(this);
        };

        SelectEditor.prototype._onValueChange = function (value) {
            this.elem().value = value;
        };
        return SelectEditor;
    })(BasicEditor);
    onde.SelectEditor = SelectEditor;

    // Very simple editor that binds a checkbox to a "true/false" property.
    // If this editor finds it changed to something other than true/false, it will treat it as "false".
    // TODO: Implement simple typed properties so we can drop all this stupid stringly-typed code.
    var CheckboxEditor = (function (_super) {
        __extends(CheckboxEditor, _super);
        function CheckboxEditor(elem) {
            if (typeof elem === "undefined") { elem = null; }
            var _this = this;
            _super.call(this, elem || document.createElement("input"));
            this.elem().type = "checkbox";
            this._elem.onchange = function () {
                // Construct ops that clobber the whole value by deleting everything first.
                _this._setValue(_this.elem().checked ? "true" : "false");
            };
        }
        CheckboxEditor.prototype.elem = function () {
            return _super.prototype.elem.call(this);
        };

        CheckboxEditor.prototype._onValueChange = function (value) {
            this.elem().checked = value == "true";
        };
        return CheckboxEditor;
    })(BasicEditor);
    onde.CheckboxEditor = CheckboxEditor;

    // Simple editor that handles <input type=text> and <textarea> elements.
    // It's generates mutations using a naïve O(N) diff algorithm, and is thus not
    // suitable for large amounts of text.
    //
    // Adapted from github.com/share/ShareJS. See original license in LICENSES file.
    var TextInputEditor = (function () {
        function TextInputEditor() {
            var _this = this;
            this._prevValue = "";
            this._elem = document.createElement("input");

            var eventNames = ["textInput", "keydown", "keyup", "select", "cut", "paste"];
            for (var i = 0; i < eventNames.length; i++) {
                this._elem.addEventListener(eventNames[i], function (e) {
                    _this.genOp(e);
                }, false);
            }
        }
        TextInputEditor.prototype.elem = function () {
            return this._elem;
        };

        TextInputEditor.prototype.bind = function (card, prop) {
            var _this = this;
            this.unbind();

            // _merge guards against op feedback loops.
            this._binding = card.bind(prop, function (value) {
                _this._merge = true;
                _this._elem.value = _this._prevValue = value;
                _this._merge = false;
            }, function (ops) {
                _this._merge = true;
                _this.applyOps(ops);
                _this._merge = false;
            });
        };

        TextInputEditor.prototype.unbind = function () {
            if (this._binding) {
                this._binding.release();
                this._binding = null;
            }
        };

        TextInputEditor.prototype.genOp = function (e) {
            var _this = this;
            setTimeout(function () {
                if (_this._elem.value !== _this._prevValue) {
                    var ops = _this.makeChange(_this._prevValue, _this._elem.value.replace(/\r\n/g, "\n"));
                    if (ops) {
                        _this._binding.revise(ops);
                    }
                    _this._prevValue = _this._elem.value;
                }
            }, 0);
        };

        // Replace the content of the text area with newText, and transform the
        // current cursor by the specified function.
        TextInputEditor.prototype.replaceText = function (newText, transformCursor) {
            if (transformCursor) {
                var newSelection = [transformCursor(this._elem.selectionStart), transformCursor(this._elem.selectionEnd)];
            }

            // Fixate the window's scroll while we set the element's value. Otherwise
            // the browser scrolls to the element.
            var scrollTop = this._elem.scrollTop;
            this._elem.value = newText;
            this._prevValue = this._elem.value;
            if (this._elem.scrollTop !== scrollTop)
                this._elem.scrollTop = scrollTop;

            if (newSelection && document.activeElement === this._elem) {
                this._elem.selectionStart = newSelection[0];
                this._elem.selectionEnd = newSelection[1];
            }
        };

        TextInputEditor.prototype.applyOps = function (ops) {
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
        };

        TextInputEditor.prototype.onInsert = function (pos, text) {
            var transformCursor = function (cursor) {
                return pos < cursor ? cursor + text.length : cursor;
            };

            // Remove any window-style newline characters. Windows inserts these, and
            // they mess up the generated diff.
            var prev = this._elem.value.replace(/\r\n/g, "\n");
            this.replaceText(prev.slice(0, pos) + text + prev.slice(pos), transformCursor);
        };

        TextInputEditor.prototype.onRemove = function (pos, length) {
            var transformCursor = function (cursor) {
                // If the cursor is inside the deleted region, we only want to move back to the start
                // of the region. Hence the Math.min.
                return pos < cursor ? cursor - Math.min(length, cursor - pos) : cursor;
            };

            var prev = this._elem.value.replace(/\r\n/g, "\n");
            this.replaceText(prev.slice(0, pos) + prev.slice(pos + length), transformCursor);
        };

        TextInputEditor.prototype.makeChange = function (oldval, newval) {
            if (oldval === newval) {
                return null;
            }

            var commonStart = 0;
            while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
                commonStart++;
            }

            var commonEnd = 0;
            while ((oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd)) && (commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length)) {
                commonEnd++;
            }

            var ret = [commonStart];
            if (oldval.length !== commonStart + commonEnd) {
                ret.push(-(oldval.length - commonStart - commonEnd));
            }
            if (newval.length !== commonStart + commonEnd) {
                ret.push(newval.slice(commonStart, newval.length - commonEnd));
            }
            ret.push(commonEnd);
            return ret;
        };
        return TextInputEditor;
    })();
    onde.TextInputEditor = TextInputEditor;

    // Component that binds an Ace-based text editor to a Card.
    var AceEditor = (function () {
        function AceEditor() {
            var _this = this;
            this._merge = false;
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

            this._acedoc.on("change", function (e) {
                if (_this._merge) {
                    // Don't re-send changes due to ops being applied (or if the card's not yet loaded).
                    return;
                }

                var delta = e.data;
                var ops = deltaToOps(documentLines(_this._acedoc), delta);
                _this._binding.revise(ops);
            });
        }
        AceEditor.prototype.elem = function () {
            return this._elem;
        };

        AceEditor.prototype.bind = function (card, prop) {
            var _this = this;
            this.unbind();

            // _merge guards against op feedback loops.
            this._binding = card.bind(prop, function (value) {
                _this._merge = true;
                _this._acedoc.setValue(value);
                _this._merge = false;
            }, function (ops) {
                _this._merge = true;
                applyOps(_this._acedoc, ops);
                _this._merge = false;
            });
        };

        AceEditor.prototype.unbind = function () {
            if (this._binding) {
                this._binding.release();
                this._binding = null;
            }
        };
        return AceEditor;
    })();
    onde.AceEditor = AceEditor;

    var range = ace.require("ace/range");

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
            if (--off < 0 || i == lastRow - 1) {
                return { row: i, column: j };
            }
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
        return acedoc["$lines"] || acedoc.getAllLines();
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
/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="card.ts" />
/// <reference path="lib/stmd.d.ts" />
var onde;
(function (onde) {
    function nearestAnchor(node) {
        while (node) {
            if (node.nodeType == Node.ELEMENT_NODE) {
                var elem = node;
                if (elem.tagName.toLowerCase() == 'a') {
                    return elem;
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
    var MarkViewer = (function () {
        function MarkViewer(_ctx, _elem) {
            this._ctx = _ctx;
            this._elem = _elem;
            this._parser = new stmd.DocParser();
            this._renderer = new stmd.HtmlRenderer();
            // Capture mouse clicks and forward certain links to pushState().
            _elem.addEventListener("click", function (e) {
                if (e.altKey || e.ctrlKey || e.metaKey) {
                    // Don't eat anything but normal left-clicks.
                    return;
                }

                var a = nearestAnchor(e.target);
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
        MarkViewer.prototype.bind = function (card, prop) {
            var _this = this;
            this.unbind();

            this._binding = card.bind(prop, function (value) {
                _this.update(value);
            }, function (ops) {
                // Skip the ops and just use the value directly.
                _this.update(card.prop(prop));
            });
        };

        MarkViewer.prototype.unbind = function () {
            if (this._binding) {
                this._binding.release();
                this._binding = null;
            }
        };

        MarkViewer.prototype.elem = function () {
            return this._elem;
        };

        MarkViewer.prototype.update = function (source) {
            var doc = this._parser.parse(source);
            this._elem.innerHTML = this._renderer.render(doc);
        };
        return MarkViewer;
    })();
    onde.MarkViewer = MarkViewer;

    // Simple text viewer.
    var TextViewer = (function () {
        function TextViewer(_elem) {
            this._elem = _elem;
        }
        TextViewer.prototype.bind = function (card, prop) {
            var _this = this;
            this.unbind();

            this._binding = card.bind(prop, function (value) {
                _this._elem.textContent = value;
            }, function (ops) {
                // Skip the ops and just use the value directly.
                _this._elem.textContent = card.prop(prop);
            });
        };

        TextViewer.prototype.unbind = function () {
            if (this._binding) {
                this._binding.release();
                this._binding = null;
            }
        };

        TextViewer.prototype.elem = function () {
            return this._elem;
        };
        return TextViewer;
    })();
    onde.TextViewer = TextViewer;
})(onde || (onde = {}));
/// <reference path="editors.ts" />
/// <reference path="viewers.ts" />
/// <reference path="card.ts" />
var onde;
(function (onde) {
    var CardDetail = (function (_super) {
        __extends(CardDetail, _super);
        function CardDetail(_ctx, _cardId) {
            var _this = this;
            _super.call(this, "CardDetail");
            this._ctx = _ctx;
            this._cardId = _cardId;
            this._editing = false;

            this._titleEditor = new onde.TextInputEditor();
            this._kindEditor = new onde.SelectEditor(["note", "idea", "effort"], ["Note", "Idea", "Effort"], this.$(".kind"));
            this._doneEditor = new onde.CheckboxEditor(this.$(".done"));
            this._bodyEditor = new onde.AceEditor();
            this._commentList = new onde.CommentList(_ctx);

            this._titleViewer = new onde.TextViewer(this.$('.display > .title'));
            this._bodyViewer = new onde.MarkViewer(_ctx, this.$('.display > .body'));

            this.$(".edit > .title").appendChild(this._titleEditor.elem());
            this.$(".edit > .body").appendChild(this._bodyEditor.elem());
            this.$(".comments").appendChild(this._commentList.elem());

            this._card = new onde.Card(this._ctx, this._cardId);
            this._kindEditor.bind(this._card, "kind");
            this._doneEditor.bind(this._card, "done");

            this._editing = true;
            this.toggleEdit();
            this.$(".edit-mode").onclick = function () {
                _this.toggleEdit();
            };

            this._commentList.setCardId(this._cardId);
        }
        CardDetail.prototype.release = function () {
            this._card.release();
            this._card = null;
        };

        CardDetail.prototype.toggleEdit = function () {
            this._editing = !this._editing;
            if (this._editing) {
                this.$(".display").style.display = 'none';
                this.$(".edit").style.display = 'block';
                this.$(".edit-mode").textContent = "done";
                this._titleViewer.unbind();
                this._bodyViewer.unbind();
                this._titleEditor.bind(this._card, "title");
                this._bodyEditor.bind(this._card, "body");
            } else {
                this.$(".display").style.display = 'block';
                this.$(".edit").style.display = 'none';
                this.$(".edit-mode").textContent = "edit";
                this._titleEditor.unbind();
                this._bodyEditor.unbind();
                this._titleViewer.bind(this._card, "title");
                this._bodyViewer.bind(this._card, "body");
            }
        };
        return CardDetail;
    })(onde.TemplateView);
    onde.CardDetail = CardDetail;
})(onde || (onde = {}));
/// <reference path="carddetail.ts" />
var onde;
(function (onde) {
    var CardDetailDialog = (function (_super) {
        __extends(CardDetailDialog, _super);
        function CardDetailDialog(_ctx, cardId) {
            var _this = this;
            _super.call(this, "CardDetailDialog");
            this._ctx = _ctx;
            this._detail = new onde.CardDetail(_ctx, cardId);
            this.$(".container").appendChild(this._detail.elem());
            this.$('.close').onclick = function () {
                _this.requestHide();
            };
        }
        CardDetailDialog.prototype.requestHide = function () {
            this.onRequestClose();
        };

        CardDetailDialog.prototype.show = function () {
            if (this.showing()) {
                return;
            }
            _super.prototype.show.call(this);
        };

        CardDetailDialog.prototype.hide = function () {
            if (!this.showing()) {
                return;
            }
            _super.prototype.hide.call(this);
            this._detail.release();
        };
        return CardDetailDialog;
    })(onde.Dialog);
    onde.CardDetailDialog = CardDetailDialog;
})(onde || (onde = {}));
var onde;
(function (onde) {
    var SavedSearches = (function (_super) {
        __extends(SavedSearches, _super);
        function SavedSearches(_ctx) {
            _super.call(this, "SavedSearches");
            this._ctx = _ctx;

            // TODO: Make all this dynamic.
            this.addItem("All cards", "prop_type:card");
            this.addItem("Uncompleted cards", "prop_type:card -prop_done:true");
            this.addItem("Completed cards", "prop_type:card prop_done:true");
        }
        SavedSearches.prototype.addItem = function (name, search) {
            var _this = this;
            var a = document.createElement("a");
            a.textContent = name;
            a.href = "#";
            a.onclick = function (e) {
                _this.onSearch(search);
                e.preventDefault();
            };
            this.elem().appendChild(a);
        };
        return SavedSearches;
    })(onde.TemplateView);
    onde.SavedSearches = SavedSearches;
})(onde || (onde = {}));
var onde;
(function (onde) {
    var HistoryNode = (function () {
        function HistoryNode(_root) {
            this._root = _root;
        }
        HistoryNode.prototype.register = function (onstate) {
            this.onstate = onstate;
            if (this._onregister) {
                this._onregister();
            }
        };

        HistoryNode.prototype.navigate = function (state, replace) {
            if (typeof replace === "undefined") { replace = false; }
            this._root._navigate(this.path(state), replace);
        };

        HistoryNode.prototype.path = function (newState) {
            var node = this.parent;
            while (node) {
                newState.unshift(node.state);
                node = node.parent;
            }
            return '/' + newState.join('/');
        };
        return HistoryNode;
    })();
    onde.HistoryNode = HistoryNode;

    var History = (function (_super) {
        __extends(History, _super);
        function History() {
            var _this = this;
            _super.call(this, this);

            if (window.onpopstate && typeof window.onpopstate == "function") {
                var oldFunc = window.onpopstate;
                window.onpopstate = function () {
                    oldFunc();
                    _this.onPopState();
                };
            } else {
                window.onpopstate = function () {
                    _this.onPopState();
                };
            }
        }
        History.watch = function (watcher) {
            History._watchers.push(watcher);
        };

        History.prototype.register = function (onstate) {
            _super.prototype.register.call(this, onstate);
            this.onPopState();
        };

        History.prototype._navigate = function (state, replace) {
            if (replace) {
                history.replaceState(null, '', state);
            } else {
                history.pushState(null, '', state);
            }
            this.onPopState();
        };

        History.prototype.onPopState = function () {
            var parts = window.location.pathname.split('/').slice(1);

            // Node registration callback. This callback shuffle is used to ensure that each node gets its
            // onstate() event fired only after it's been registered. 'curNode' keeps track of the next node
            // to receive its callback across callbacks.
            var curNode = this;
            var registered = function () {
                var target = curNode;
                curNode = curNode.child;
                if (target.onstate) {
                    target.onstate(target.state, curNode);
                }
            };

            // Build the node stack.
            var node = this;
            for (i = 1; i < parts.length; ++i) {
                var state = parts[i];
                if (!state)
                    state = '';

                var newNode = new HistoryNode(this);
                node.child = newNode;
                newNode.parent = node;
                newNode.state = state;
                newNode._onregister = registered;

                node = newNode;
            }

            // Stick a "ground" node on the end.
            var groundNode = new HistoryNode(this);
            groundNode.parent = node;
            groundNode.state = "";
            groundNode._onregister = registered;
            node.child = groundNode;

            // Fire onstate to the root node, which will kick off the rest.
            this.state = parts[0];
            registered();

            for (var i = 0; i < History._watchers.length; i++) {
                History._watchers[i](parts);
            }
        };
        History._watchers = [];
        return History;
    })(HistoryNode);
    onde.History = History;
})(onde || (onde = {}));
/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="search.ts" />
/// <reference path="comments.ts" />
/// <reference path="views.ts" />
/// <reference path="context.ts" />
/// <reference path="carddetail.ts" />
/// <reference path="carddetaildlg.ts" />
/// <reference path="savedsearches.ts" />
/// <reference path="history.ts" />
var onde;
(function (onde) {
    var DEBUG = true;

    var UI = (function (_super) {
        __extends(UI, _super);
        function UI(_user, _pass) {
            var _this = this;
            _super.call(this, "UI");
            this._user = _user;
            this._pass = _pass;

            this._connection = new onde.Connection(this);

            this._statusElem = this.$(".status");
            this._createElem = this.$(".create");

            this._savedSearches = new onde.SavedSearches(this);
            this._searchBox = new onde.SearchBox(this);

            var container = this.$(".container");
            container.appendChild(this._savedSearches.elem());
            container.appendChild(this._searchBox.elem());

            this._searchBox.onSelectCard = function (cardId) {
                _this._history.navigate(["card", cardId]);
            };

            this._createElem.onclick = function (e) {
                _this.connection().createCard({
                    type: "card",
                    body: "",
                    kind: "note"
                }, function (rsp) {
                    _this._history.navigate(["card", rsp.CardId]);
                });
            };

            this._savedSearches.onSearch = function (search) {
                _this._searchBox.search(search);
            };

            this.connection().onOpen = function () {
                _this.onOpen();
            };
            this.connection().onClose = function () {
                _this.onClose();
            };
            this.connection().onLogin = function () {
                _this.onLogin();
            };
            this.connection().connect();
        }
        UI.prototype.log = function (msg) {
            if (DEBUG) {
                console.log(msg);
            }
        };

        UI.prototype.connection = function () {
            return this._connection;
        };

        UI.prototype.history = function () {
            return this._history;
        };

        UI.prototype.initHistory = function () {
            var _this = this;
            new onde.History().register(function (state, child) {
                _this._history = child;
                if (state != "ui") {
                    _this._history.navigate(["ui"]);
                    return;
                }

                _this._history.register(function (state, child) {
                    switch (state) {
                        case "card":
                            child.register(function (state, _) {
                                _this.showCardDetail(state);
                            });
                            break;
                        case "":
                            _this.hideCardDetail();
                            break;
                        default:
                            // Map invalid states back to /ui.
                            _this._history.navigate([""], true);
                            break;
                    }
                });
            });
        };

        UI.prototype.showCardDetail = function (cardId) {
            this.hideCardDetail();
            this._detail = new onde.CardDetailDialog(this, cardId);
            this._detail.onRequestClose = function () {
                window.history.back();
            };
            this._detail.show();
        };

        UI.prototype.hideCardDetail = function () {
            if (this._detail) {
                this._detail.hide();
                this._detail = null;
            }
        };

        UI.prototype.setStatus = function (msg) {
            this._statusElem.textContent = msg;
        };

        UI.prototype.onOpen = function () {
            this.log("connection open");
            this.setStatus("connected");
            this.connection().login(this._user, this._pass);
        };

        UI.prototype.onClose = function () {
            this.log("connection closed; refresh to reconnect for now");
            // TODO: Reconnection logic doesn't work yet, so don't bother trying.
            //    log("connection closed; reconnecting in 1s");
            //    setStatus("disconnected");
            //    setTimeout(() => { this.connection().connect(); }, 1000);
        };

        UI.prototype.onLogin = function () {
            this.initHistory();
            this.setStatus("logged in");
            if (!this._searchBox.curQuery()) {
                // Do a default search to get the ball rolling.
                this._searchBox.search("prop_type:card prop_title:* prop_body:*");
            }
        };
        return UI;
    })(onde.TemplateView);
    onde.UI = UI;

    function parseQuery() {
        var parts = location.search.substring(1).split("&");
        var result = {};
        for (var i = 0; i < parts.length; ++i) {
            var kv = parts[i].split("=");
            result[kv[0]] = kv[1];
        }
        return result;
    }
})(onde || (onde = {}));

// Quick hack to do user/pass
// TODO: move this to cookie session token.
//    var params = parseQuery();
//    var user = params["user"];
//    var pass = params["pass"];
//    if (!user || !pass) {
//      window.alert("Remember to use ?user=...&pass=... on the query string");
//      return;
//    }
var user = "joel", pass = "bubba42";
var ui = new onde.UI(user, pass);
document.body.appendChild(ui.elem());
