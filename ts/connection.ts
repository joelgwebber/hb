/// <reference path="lib/sockjs.d.ts" />

module onde.connection {

  var _curSubId = 0;

  class Doc {
    subs: DocSubscription[] = [];
    body: string;
    rev: number;
  }

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
      // TODO
    }
  }

  export class SearchSubscription {
    constructor(
        public query: string,
        private _onsearchresults: (rsp: SearchResultsRsp) => void) { }

    unsubscribe() {
      // TODO
    }
  }

  var sock: SockJS;
  var connId: string;
  var docSubs: {[docId: string]: Doc} = {};
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

    var alreadySubbed = false;
    if (docId in docSubs) {
      alreadySubbed = true;
    } else {
      docSubs[docId] = new Doc();
      var req: Req = {
        Type: MsgSubscribeDoc,
        SubscribeDoc: { DocId: docId, SubId: sub._subId }
      };
      sock.send(JSON.stringify(req));
    }

    var doc = docSubs[docId];
    doc.subs.push(sub);

    if (alreadySubbed) {
      var rsp: SubscribeDocRsp = {
        DocId: docId,
        SubId: sub._subId,
        Rev: doc.rev,
        Doc: doc.body
      };
      sub._onsubscribe(rsp);
    }
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
    var doc = docSubs[rsp.DocId];
    if (!doc) {
      log("unexpected state: got revision for docid " + rsp.DocId + " with no open subscriptions");
      return
    }
    doc.body = rsp.Doc;
    doc.rev = rsp.Rev;
    for (var i = 0; i < doc.subs.length; ++i) {
      doc.subs[i]._onsubscribe(rsp);
    }
  }

  function handleRevise(rsp: ReviseRsp) {
    var doc = docSubs[rsp.DocId];
    if (!doc) {
      log("unexpected state: got revision for docid " + rsp.DocId + " with no open subscriptions");
      return
    }
    for (var i = 0; i < doc.subs.length; ++i) {
      var sub = doc.subs[i];
      if ((rsp.OrigConnId == connId) && (rsp.OrigSubId == sub._subId)) {
        sub._onack(rsp);
      } else {
        sub._onrevision(rsp);
      }
    }
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
        // TODO
        log(rsp.SearchResults);
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
