/// <reference path="connection.ts" />

module onde {

  export class SearchBox {
    private _elem: HTMLElement;
    private _input: HTMLInputElement;
    private _results: HTMLElement;
    private _sub: connection.SearchSubscription;

    onSelectCard: (cardId: string) => void;

    constructor() {
      this._elem = document.createElement("div");
      this._elem.className = "SearchBox";
      this._input = document.createElement("input");
      this._input.className = "entry";
      this._results = document.createElement("div");
      this._results.className = "results";

      this._elem.appendChild(this._input);
      this._elem.appendChild(this._results);

      this._input.onchange = (e) => { this.search(this._input.value); }
    }

    elem(): HTMLElement {
      return this._elem;
    }

    search(query: string) {
      if (this._sub) {
        if (this._sub.query == query) {
          return;
        }
        this._sub.unsubscribe();
      }

      this._sub = connection.subscribeSearch(query, (rsp) => {
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
      var item = document.createElement("div");
      item.className = "item";
      item.textContent = result.Title;
      item.onclick = (e) => { this.selectItem(result.CardId); };
      return item;
    }

    private selectItem(cardId: string) {
      if (this.onSelectCard) {
        this.onSelectCard(cardId);
      }
    }
  }
}
