module onde {

  class SearchItem {
    constructor(public _name: string, public _search: string, public _elem: HTMLAnchorElement) { }
  }

  export class SavedSearches extends TemplateView {
    private _items: SearchItem[] = [];
    onSearch: (search: string) => void;

    constructor(private _ctx: Context) {
      super("SavedSearches");

      // TODO: Make all this dynamic.
      this.addItem("Notes", "prop_type:card prop_kind:note");
      this.addItem("Ideas", "prop_type:card prop_kind:idea");
      this.addItem("Efforts", "prop_type:card prop_kind:effort -prop_done:true");
      this.addItem("Completed", "prop_type:card prop_kind:effort prop_done:true");
    }

    selectFirst() {
      this.onSearch(this._items[0]._search);
    }

    private addItem(name: string, search: string) {
      var a = <HTMLAnchorElement>document.createElement("a");
      a.textContent = name;
      a.href = "#";
      a.onclick = (e) => {
        this.onSearch(search);
        e.preventDefault();
      };
      this.elem().appendChild(a);
      this._items.push(new SearchItem(name, search, a));
    }
  }
}
