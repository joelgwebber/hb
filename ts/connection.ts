/// <reference path="lib/sockjs.d.ts" />

// TODO:
// - Implement outgoing message queue.
// - Re-establish connection automatically.
// - Track acknowledged requests.
module onde.connection {

  var LOG_MESSAGES = true;

  export class CardSubscription {
    _subId: number;

    constructor(
        public cardId: string,
        public _onsubscribe: (rsp: SubscribeCardRsp) => void,
        public _onrevision: (rsp: ReviseRsp) => void,
        public _onack: (rsp: ReviseRsp) => void) {
      this._subId = ++_curSubId;
    }

    revise(rev: number, change: Change) {
      var req: Req = {
        Type: MsgRevise,
        Revise: { ConnId: connId, SubId: this._subId, CardId: this.cardId, Rev: rev, Change: change }
      };
      send(req);
    }

    unsubscribe() {
      var req: Req = {
        Type: MsgUnsubscribeCard,
        UnsubscribeCard: { SubId: this._subId }
      };
      send(req);
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
        send(req);
        delete searchSubs[this.query];
      }
    }
  }

  var _curSubId = 0;
  var _curCreateId = 0;

  var sock: SockJS;
  var connId: string;
  var cardSubs: {[key: string]: CardSubscription} = {};
  var searchSubs: {[query: string]: SearchSubscription[]} = {};
  var onCreates: {[createId: number]: (rsp: CreateCardRsp) => void} = {};

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
    send(req);
  }

  export function subscribeCard(cardId: string,
      onSubscribe: (rsp: SubscribeCardRsp) => void,
      onRevision: (rsp: ReviseRsp) => void,
      onAck: (rsp: ReviseRsp) => void): CardSubscription {

    var sub = new CardSubscription(cardId, onSubscribe, onRevision, onAck);
    cardSubs[cardSubKey(cardId, sub._subId)] = sub;

    var req: Req = {
      Type: MsgSubscribeCard,
      SubscribeCard: { CardId: cardId, SubId: sub._subId }
    };
    send(req);
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
      send(req);
    }

    var sub = new SearchSubscription(query, onSearchResults);
    searchSubs[query].push(sub);
    return sub;
  }

  export function createCard(props: {[prop: string]: string}, onCreated: (rsp: CreateCardRsp) => void) {
    var id = ++_curCreateId;
    onCreates[id] = onCreated;
    var req: Req = {
      Type: MsgCreateCard,
      CreateCard: {
        CreateId: id,
        Props: props
      }
    };
    send(req);
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

  function handleSubscribeCard(rsp: SubscribeCardRsp) {
    var sub = cardSubs[cardSubKey(rsp.CardId, rsp.SubId)];
    sub._onsubscribe(rsp);
  }

  function handleRevise(rsp: ReviseRsp) {
    for (var i = 0; i < rsp.SubIds.length; ++i) {
      var sub = cardSubs[cardSubKey(rsp.CardId, rsp.SubIds[0])];
      if (!sub) {
        log("got results for card " + rsp.CardId + " with no local subscription");
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

  function handleCreateCard(rsp: CreateCardRsp) {
    var onCreate = onCreates[rsp.CreateId];
    if (!onCreate) {
      log("got unmatched create response " + rsp.CreateId);
      return;
    }

    delete onCreates[rsp.CreateId];
    onCreate(rsp);
  }

  function cardSubKey(cardId: string, subId: number): string {
    return cardId + ":" + subId;
  }

  function send(req: Req) {
    if (LOG_MESSAGES) {
      log(req);
    }
    sock.send(JSON.stringify(req));
  }

  function onMessage(e: SJSMessageEvent) {
    var rsp = <Rsp>JSON.parse(e.data);
    if (LOG_MESSAGES) {
      log(rsp);
    }
    switch (rsp.Type) {
      case MsgLogin:
        handleLogin(rsp.Login);
        break;

      case MsgSubscribeCard:
        handleSubscribeCard(rsp.SubscribeCard);
        break;

      case MsgUnsubscribeCard:
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

      case MsgCreateCard:
        handleCreateCard(rsp.CreateCard);
        break;

      case MsgError:
        log(rsp.Error.Msg);
        break;
    }
  }
}
