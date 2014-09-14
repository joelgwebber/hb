/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="search.ts" />
/// <reference path="comments.ts" />
/// <reference path="views.ts" />
/// <reference path="context.ts" />
/// <reference path="carddetail.ts" />
/// <reference path="savedsearches.ts" />
/// <reference path="history.ts" />

module onde {
  var DEBUG = true;

  class Onde extends TemplateView implements Context {
    private _connection: Connection;

    private _savedSearches: SavedSearches;
    private _searchBox: SearchBox;
    private _detail: CardDetail;
    private _statusElem;
    private _createElem;
    private _history: HistoryNode;
    private _uiHistory: HistoryNode;

    constructor(private _user: string, private _pass: string) {
      super("Onde");

      this._connection = new Connection(this);

      this._statusElem = this.$(".status");
      this._createElem = this.$(".create");

      this._savedSearches = new SavedSearches(this);
      this._searchBox = new SearchBox(this);

      var container = this.$(".container");
      container.appendChild(this._savedSearches.elem());
      container.appendChild(this._searchBox.elem());

      this._searchBox.onSelectCard = (cardId) => {
        this._history.navigate(["card", cardId]);
      };

      this._createElem.onclick = (e) => {
        this.connection().createCard({
          type: "card",
          body: "",
          kind: "note"
        }, (rsp) => {
          this.showCardDetail(rsp.CardId);
        });
      };

      this._savedSearches.onSearch = (search) => { this._searchBox.search(search); };

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
      new History().register((state, child) => {
        this._history = child;
        if (state != "ui") {
          this._history.navigate(["ui"]);
          return;
        }

        this._history.register((state, child) => {
          switch (state) {
            case "card":
              child.register((state, _) => {
                this.showCardDetail(state);
              });
              break;
            case "":
              this.hideCardDetail();
              break;
            default:
              // Map invalid states back to /ui.
              this._history.navigate([""], true);
              break;
          }
        });
      });
    }

    private showCardDetail(cardId: string) {
      this.hideCardDetail();
      this._detail = new CardDetail(this, cardId);
      this._detail.onRequestClose = () => {
        window.history.back();
      };
      this._detail.show();
    }

    private hideCardDetail() {
      if (this._detail) {
        this._detail.hide();
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
      if (!this._searchBox.curQuery()) {
        // Do a default search to get the ball rolling.
        this._searchBox.search("prop_type:card prop_title:* prop_body:*");
      }
    }
  }

  function parseQuery(): { [param: string]: string } {
    var parts = location.search.substring(1).split("&");
    var result = {};
    for (var i = 0; i < parts.length; ++i) {
      var kv = parts[i].split("=");
      result[kv[0]] = kv[1];
    }
    return result;
  }

  export function main() {
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
    var onde = new Onde(user, pass);
    document.body.appendChild(onde.elem());
  }
}
