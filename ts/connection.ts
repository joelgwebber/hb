/// <reference path="lib/sockjs.d.ts" />

// TODO:
// - Implement outgoing message queue.
// - Re-establish connection automatically.
// - Track acknowledged requests.
module onde {

  var LOG_MESSAGES = true;

  export class CardSubscription {
    _subId: number;

    constructor(
        private _conn: Connection,
        public cardId: string,
        public _onsubscribe: (rsp: SubscribeCardRsp) => void,
        public _onrevision: (rsp: ReviseRsp) => void,
        public _onack: (rsp: ReviseRsp) => void) {
      this._subId = ++_conn._curSubId;
    }

    revise(rev: number, change: Change) {
      var req: Req = {
        Type: MsgRevise,
        Revise: { ConnId: this._conn.connId(), SubId: this._subId, CardId: this.cardId, Rev: rev, Change: change }
      };
      this._conn._send(req);
    }

    unsubscribe() {
      var req: Req = {
        Type: MsgUnsubscribeCard,
        UnsubscribeCard: { SubId: this._subId }
      };
      this._conn._send(req);
    }
  }

  export class SearchSubscription {
    constructor(
        private _conn: Connection,
        public query: string,
        public _onsearchresults: (rsp: SearchResultsRsp) => void) { }

    unsubscribe() {
      var subs = this._conn._searchSubs[this.query];
      subs.splice(subs.indexOf(this), 1);
      if (subs.length == 0) {
        var req: Req = {
          Type: MsgUnsubscribeSearch,
          UnsubscribeSearch: { Query: this.query }
        };
        this._conn._send(req);
        delete this._conn._searchSubs[this.query];
      }
    }
  }

  export class Connection {
    private _sock: SockJS;
    private _connId: string;
    private _onCreates: {[createId: number]: (rsp: CreateCardRsp) => void} = {};

    _cardSubs: {[key: string]: CardSubscription} = {};
    _searchSubs: {[query: string]: SearchSubscription[]} = {};
    _curSubId = 0;
    _curCreateId = 0;

    onOpen: () => void;
    onClose: () => void;
    onLogin: () => void;

    constructor(private _ctx: Context) {
    }

    connect() {
      this._sock = new SockJS(this.getOrigin() + "/sock", null, {
        debug: true
      });

      this._sock.onopen = () => {
        if (this.onOpen) {
          this.onOpen();
        }
      };
      this._sock.onclose = () => {
        this._sock = null;
        this.connId = null;
        if (this.onClose) {
          this.onClose();
        }
      };
      this._sock.onmessage = (e: SJSMessageEvent) => { this.onMessage(e); };
    }

    connId(): string {
      return this._connId;
    }

    login(userId: string) {
      var req: Req = {
        Type: MsgLogin,
        Login: { UserId: userId }
      };
      this._send(req);
    }

    subscribeCard(cardId: string, onSubscribe: (rsp: SubscribeCardRsp) => void, onRevision: (rsp: ReviseRsp) => void, onAck: (rsp: ReviseRsp) => void): CardSubscription {
      var sub = new CardSubscription(this, cardId, onSubscribe, onRevision, onAck);
      this._cardSubs[cardSubKey(cardId, sub._subId)] = sub;

      var req: Req = {
        Type: MsgSubscribeCard,
        SubscribeCard: { CardId: cardId, SubId: sub._subId }
      };
      this._send(req);
      return sub;
    }

    subscribeSearch(query: string, onSearchResults: (rsp: SearchResultsRsp) => void): SearchSubscription {
      if (!(query in this._searchSubs)) {
        this._searchSubs[query] = [];
        var req: Req = {
          Type: MsgSubscribeSearch,
          SubscribeSearch: { Query: query }
        };
        this._send(req);
      }

      var sub = new SearchSubscription(this, query, onSearchResults);
      this._searchSubs[query].push(sub);
      return sub;
    }

    createCard(props: {[prop: string]: string}, onCreated: (rsp: CreateCardRsp) => void) {
      var id = ++this._curCreateId;
      this._onCreates[id] = onCreated;
      var req: Req = {
        Type: MsgCreateCard,
        CreateCard: {
          CreateId: id,
          Props: props
        }
      };
      this._send(req);
    }

    _send(req: Req) {
      if (LOG_MESSAGES) {
        this._ctx.log(req);
      }
      this._sock.send(JSON.stringify(req));
    }

    private getOrigin(): string {
      return location.protocol + "//" + location.hostname + (location.port ? (":" + location.port) : "");
    }

    private handleLogin(rsp: LoginRsp) {
      this._connId = rsp.ConnId;
      if (this.onLogin) {
        this.onLogin();
      }
    }

    private handleSubscribeCard(rsp: SubscribeCardRsp) {
      var sub = this._cardSubs[cardSubKey(rsp.CardId, rsp.SubId)];
      sub._onsubscribe(rsp);
    }

    private handleRevise(rsp: ReviseRsp) {
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
    }

    private handleSearchResults(rsp: SearchResultsRsp) {
      var subs = this._searchSubs[rsp.Query];
      if (!subs) {
        this._ctx.log("got results for search " + rsp.Query + " with no local subscription");
        return;
      }

      for (var i = 0; i < subs.length; ++i) {
        subs[i]._onsearchresults(rsp);
      }
    }

    private handleCreateCard(rsp: CreateCardRsp) {
      var onCreate = this._onCreates[rsp.CreateId];
      if (!onCreate) {
        this._ctx.log("got unmatched create response " + rsp.CreateId);
        return;
      }

      delete this._onCreates[rsp.CreateId];
      onCreate(rsp);
    }

    private onMessage(e: SJSMessageEvent) {
      var rsp = <Rsp>JSON.parse(e.data);
      if (LOG_MESSAGES) {
        this._ctx.log(rsp);
      }
      switch (rsp.Type) {
        case MsgLogin:
          this.handleLogin(rsp.Login);
          break;

        case MsgSubscribeCard:
          this.handleSubscribeCard(rsp.SubscribeCard);
          break;

        case MsgUnsubscribeCard:
          // TODO
          break;

        case MsgRevise:
          this.handleRevise(rsp.Revise);
          break;

        case MsgSubscribeSearch:
          // TODO
          break;

        case MsgSearchResults:
          this.handleSearchResults(rsp.SearchResults);
          break;

        case MsgUnsubscribeSearch:
          // TODO
          break;

        case MsgCreateCard:
          this.handleCreateCard(rsp.CreateCard);
          break;

        case MsgError:
          this._ctx.log(rsp.Error.Msg);
          break;
      }
    }
  }

  function cardSubKey(cardId: string, subId: number): string {
    return cardId + ":" + subId;
  }
}
