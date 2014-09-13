module onde {

  export class SavedSearches extends TemplateView {
    onSearch: (search: string) => void;

    constructor(private _ctx: Context) {
      super("SavedSearches");

      // TODO: Make all this dynamic.
      this.addItem("All cards", "prop_type:card");
      this.addItem("Uncompleted cards", "prop_type:card -prop_done:true");
      this.addItem("Completed cards", "prop_type:card prop_done:true");
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
    }
  }
}
