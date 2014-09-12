/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="search.ts" />
/// <reference path="editor.ts" />
/// <reference path="comments.ts" />
/// <reference path="views.ts" />
/// <reference path="context.ts" />
/// <reference path="carddetail.ts" />

module onde {
  var DEBUG = true;

  class Onde extends TemplateView implements Context {
    private _connection: Connection;

    private _searchBox: SearchBox;
    private _cardDetail: CardDetail;
    private _statusElem;
    private _createElem;

    constructor() {
      super("Onde");

      this._connection = new Connection(this);

      this._statusElem = this.$(".status");
      this._createElem = this.$(".create");

      this._searchBox = new SearchBox(this);
      this._cardDetail = new CardDetail(this);

      var container = this.$(".container");
      container.appendChild(this._searchBox.elem());
      container.appendChild(this._cardDetail.elem());

      this._searchBox.onSelectCard = (cardId) => {
        this._cardDetail.setCardId(cardId);
      };

      this._createElem.onclick = (e) => {
        this.connection().createCard({
          type: "card",
          body: "..."
        }, (rsp) => {
          this._cardDetail.setCardId(rsp.CardId);
        });
      };

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

    private setStatus(msg: string) {
      this._statusElem.textContent = msg;
    }

    private onOpen() {
      this.log("connection open");
      this.setStatus("connected");
      this.connection().login("joel");
    }

    private onClose() {
      this.log("connection closed; refresh to reconnect for now");
//    log("connection closed; reconnecting in 1s");
//    setStatus("disconnected");
//    setTimeout(() => { this.connection().connect(); }, 1000);
    }

    private onLogin() {
      this.setStatus("logged in");
    }
  }

  export function main() {
    var onde = new Onde();
    document.body.appendChild(onde.elem());
  }
}
