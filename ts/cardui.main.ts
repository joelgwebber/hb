/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="search.ts" />
/// <reference path="comments.ts" />
/// <reference path="views.ts" />
/// <reference path="context.ts" />
/// <reference path="carddetail.ts" />
/// <reference path="savedsearches.ts" />
/// <reference path="history.ts" />

module hb {
  var DEBUG = true;

  export class CardUI extends TemplateView implements Context {
    private _connection: Connection;

    private _container: HTMLElement;
    private _detail: CardDetail;
    private _statusElem;
    private _history: HistoryNode;

    constructor(private _user: string, private _pass: string) {
      super("CardUI");

      this._connection = new Connection(this);
      this._statusElem = this.$(".status");

      this._container = this.$(".container");

      this.connection().onOpen = () => { this.onOpen(); };
      this.connection().onClose = () => { this.onClose(); };
      this.connection().onLogin = () => { this.onLogin(); };
      this.connection().connect();
    }

    log(msg: any) {
      if (DEBUG) {
        console.log(msg)
      }
    }

    connection(): Connection {
      return this._connection;
    }

    history(): HistoryNode {
      return this._history;
    }

    private initHistory() {
      this._history = new History();
      this._history.register((state, child) => {
        if (state != "card") {
          this._history.navigate(["card"]);
          return;
        }

        child.register((state, _) => {
          this.showCardDetail(state);
        });
      });
    }

    private showCardDetail(cardId: string) {
      this.hideCardDetail();
      this._detail = new CardDetail(this, cardId);
      this._container.appendChild(this._detail.elem());
    }

    private hideCardDetail() {
      if (this._detail) {
        this._container.removeChild(this._detail.elem());
        this._detail.release();
        this._detail = null;
      }
    }

    private setStatus(msg: string) {
      this._statusElem.textContent = msg;
    }

    private onOpen() {
      this.log("connection open");
      this.setStatus("connected");
      this.connection().login(this._user, this._pass);
    }

    private onClose() {
      this.log("connection closed; refresh to reconnect for now");

// TODO: Reconnection logic doesn't work yet, so don't bother trying.
//    log("connection closed; reconnecting in 1s");
//    setStatus("disconnected");
//    setTimeout(() => { this.connection().connect(); }, 1000);
    }

    private onLogin() {
      this.initHistory();
      this.setStatus("logged in");
    }
  }
}

var user = "joel", pass = "bubba42";
var ui = new hb.CardUI(user, pass);
document.body.appendChild(ui.elem());
