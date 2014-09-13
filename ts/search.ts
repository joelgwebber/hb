/// <reference path="connection.ts" />
/// <reference path="views.ts" />

module onde {

  class SearchCard extends TemplateView {

    constructor(result: SearchResult) {
      super("SearchCard");
      this.$(".title").textContent = result.Title;
      this.$(".body").textContent = result.Body;
    }
  }

  export class SearchBox extends TemplateView {
    private _input: HTMLInputElement;
    private _results: HTMLElement;
    private _sub: SearchSubscription;

    onSelectCard: (cardId: string) => void;

    constructor(private _ctx: Context) {
      super("SearchBox");
      this._input = <HTMLInputElement>this.$(".entry");
      this._results = this.$(".results");
      (<HTMLInputElement> this.elem()).onsubmit = (e) => {
        this.search(this._input.value);
        e.preventDefault();
      };
    }

    curQuery(): string {
      if (!this._sub) {
        return "";
      }
      return this._sub.query;
    }

    search(query: string) {
      this._input.value = query;
      if (this._sub) {
        if (this._sub.query == query) {
          return;
        }
        this._sub.unsubscribe();
      }

      this._sub = this._ctx.connection().subscribeSearch(query, (rsp) => {
        this.render(rsp);
      });
    }

    private render(rsp: SearchResultsRsp) {
      this._results.innerHTML = "";
      for (var i = 0; i < rsp.Results.length; ++i) {
        this._results.appendChild(this.createItem(rsp.Results[i]));
      }
    }

    private createItem(result: SearchResult): HTMLElement {
      var item = new SearchCard(result);
      item.elem().onclick = (e) => { this.selectItem(result.CardId); };
      return item.elem();
    }

    private selectItem(cardId: string) {
      if (this.onSelectCard) {
        this.onSelectCard(cardId);
      }
    }
  }
}
