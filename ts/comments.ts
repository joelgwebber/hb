/// <reference path="connection.ts" />

module onde {

  export class CommentList {
    private _elem: HTMLElement;
    private _results: HTMLElement;
    private _cardId: string;
    private _sub: connection.SearchSubscription;

    constructor() {
      this._elem = document.createElement("div");
      this._elem.className = "CommentList";

      this._results = document.createElement("div");
      this._results.className = "results";
      this._elem.appendChild(this._results);

      var editor = document.createElement('input');
      this._elem.appendChild(editor);

      var editContainer = document.createElement('div');
      editContainer.className = 'editor';
      this._elem.appendChild(editContainer);
      editContainer.appendChild(editor);

      var createBtn = document.createElement('button');
      createBtn.className = "create";
      createBtn.textContent = "comment";
      createBtn.onclick = () => {
        connection.createCard({
          type: "comment",
          target: this._cardId,
          body: editor.value
        }, (rsp) => {
          editor.value = "";
        });
      };
      this._elem.appendChild(createBtn);
    }

    elem(): HTMLElement {
      return this._elem;
    }

    setCardId(cardId: string) {
      var query = "prop_type: comment AND prop_target:" + cardId;
      if (this._sub) {
        if (this._sub.query == query) {
          return;
        }
        this._sub.unsubscribe();
      }

      this._cardId = cardId;
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
      item.textContent = result.Body;
      return item;
    }
  }
}
