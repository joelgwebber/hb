/// <reference path="lib/sockjs.d.ts" />

// TODO:
// - Implement outgoing message queue.
// - Re-establish connection automatically.
// - Track acknowledged requests.
module onde.connection {

  var _curSubId = 0;

  export class DocSubscription {
    _subId: number;

    constructor(
        public docId: string,
        public _onsubscribe: (rsp: SubscribeDocRsp) => void,
        public _onrevision: (rsp: ReviseRsp) => void,
        public _onack: (rsp: ReviseRsp) => void) {
      this._subId = ++_curSubId;
    }

    revise(rev: number, ops: any[]) {
      var req: Req = {
        Type: MsgRevise,
        Revise: { ConnId: connId, SubId: this._subId, DocId: this.docId, Rev: rev, Ops: ops }
      };
      sock.send(JSON.stringify(req));
    }

    unsubscribe() {
      var req: Req = {
        Type: MsgUnsubscribeDoc,
        UnsubscribeDoc: { SubId: this._subId }
      };
      sock.send(JSON.stringify(req));
    }
  }

  export class SearchSubscription {
    constructor(
        public query: string,
        public _onsearchresults: (rsp: SearchResultsRsp) => void) { }

    unsubscribe() {
      var subs = searchSubs[this.query];
      subs.splice(subs.indexOf(this), 1);
      if (subs.length == 0) {
        var req: Req = {
          Type: MsgUnsubscribeSearch,
          UnsubscribeSearch: { Query: this.query }
        };
        sock.send(JSON.stringify(req));
        delete searchSubs[this.query];
      }
    }
  }

  var sock: SockJS;
  var connId: string;
  var docSubs: {[key: string]: DocSubscription} = {};
  var searchSubs: {[query: string]: SearchSubscription[]} = {};

  export var onOpen: () => void;
  export var onClose: () => void;
  export var onLogin: () => void;

  export function connect() {
    sock = new SockJS(getOrigin() + "/sock", null, {
      debug: true
    });

    sock.onopen = () => {
      if (onOpen) {
        onOpen();
      }
    };
    sock.onclose = () => {
      sock = null; connId = null;
      if (onClose) {
        onClose();
      }
    };
    sock.onmessage = onMessage;
  }

  export function login(userId: string) {
    var req: Req = {
      Type: MsgLogin,
      Login: { UserId: userId }
    };
    sock.send(JSON.stringify(req));
  }

  export function subscribeDoc(docId: string,
      onSubscribe: (rsp: SubscribeDocRsp) => void,
      onRevision: (rsp: ReviseRsp) => void,
      onAck: (rsp: ReviseRsp) => void): DocSubscription {

    var sub = new DocSubscription(docId, onSubscribe, onRevision, onAck);
    docSubs[docSubKey(docId, sub._subId)] = sub;

    var req: Req = {
      Type: MsgSubscribeDoc,
      SubscribeDoc: { DocId: docId, SubId: sub._subId }
    };
    sock.send(JSON.stringify(req));
    return sub;
  }

  export function subscribeSearch(query: string,
      onSearchResults: (rsp: SearchResultsRsp) => void): SearchSubscription {

    if (!(query in searchSubs)) {
      searchSubs[query] = [];
      var req: Req = {
        Type: MsgSubscribeSearch,
        SubscribeSearch: { Query: query }
      };
      sock.send(JSON.stringify(req));
    }

    var sub = new SearchSubscription(query, onSearchResults);
    searchSubs[query].push(sub);
    return sub;
  }

  function getOrigin(): string {
    return location.protocol + "//" + location.hostname + (location.port ? (":" + location.port) : "");
  }

  function handleLogin(rsp: LoginRsp) {
    connId = rsp.ConnId;
    if (onLogin) {
      onLogin();
    }
  }

  function handleSubscribeDoc(rsp: SubscribeDocRsp) {
    var sub = docSubs[docSubKey(rsp.DocId, rsp.SubId)];
    sub._onsubscribe(rsp);
  }

  function handleRevise(rsp: ReviseRsp) {
    for (var i = 0; i < rsp.SubIds.length; ++i) {
      var sub = docSubs[docSubKey(rsp.DocId, rsp.SubIds[0])];
      if (!sub) {
        log("got results for doc " + rsp.DocId + " with no local subscription");
        continue;
      }

      if ((rsp.OrigConnId == connId) && (rsp.OrigSubId == sub._subId)) {
        sub._onack(rsp);
      } else {
        sub._onrevision(rsp);
      }
    }
  }

  function handleSearchResults(rsp: SearchResultsRsp) {
    var subs = searchSubs[rsp.Query];
    if (!subs) {
      log("got results for search " + rsp.Query + " with no local subscription");
      return;
    }

    for (var i = 0; i < subs.length; ++i) {
      subs[i]._onsearchresults(rsp);
    }
  }

  function docSubKey(docId: string, subId: number): string {
    return docId + ":" + subId;
  }

  function onMessage(e: SJSMessageEvent) {
    var rsp = <Rsp>JSON.parse(e.data);
    switch (rsp.Type) {
      case MsgLogin:
        handleLogin(rsp.Login);
        break;

      case MsgSubscribeDoc:
        handleSubscribeDoc(rsp.SubscribeDoc);
        break;

      case MsgUnsubscribeDoc:
        // TODO
        break;

      case MsgRevise:
        handleRevise(rsp.Revise);
        break;

      case MsgSubscribeSearch:
        // TODO
        break;

      case MsgSearchResults:
        handleSearchResults(rsp.SearchResults);
        break;

      case MsgUnsubscribeSearch:
        // TODO
        break;

      case MsgError:
        log(rsp.Error.Msg);
        break;
    }
  }
}
