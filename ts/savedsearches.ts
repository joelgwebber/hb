module onde {

  export class SavedSearches extends TemplateView {
    onSearch: (search: string) => void;

    constructor(private _ctx: Context) {
      super("SavedSearches");

      // TODO: Make all this dynamic.
      this.addItem("All cards", "prop_type:card");
      this.addItem("Undesignated cards", "prop_type:card -prop_kind:effort -prop_kind:note -prop_kind:idea");
      this.addItem("Notes", "prop_type:card prop_kind:note");
      this.addItem("Ideas", "prop_type:card prop_kind:idea");
      this.addItem("Efforts", "prop_type:card prop_kind:effort");
      this.addItem("Uncompleted efforts", "prop_type:card prop_kind:effort -prop_done:true");
      this.addItem("Completed efforts", "prop_type:card prop_kind:effort prop_done:true");
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
