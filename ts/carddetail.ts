/// <reference path="editors.ts" />
/// <reference path="viewers.ts" />
/// <reference path="card.ts" />

module onde {

  export class CardDetail extends TemplateView {
    private _titleViewer: TextViewer;
    private _bodyViewer: MarkViewer;
    private _kindEditor: SelectEditor;
    private _titleEditor: TextInputEditor;
    private _bodyEditor: AceEditor;
    private _doneEditor: CheckboxEditor;
    private _commentList: CommentList;
    private _card: Card;
    private _editing = false;

    constructor(private _ctx: Context, private _cardId: string) {
      super("CardDetail");

      this._titleEditor = new TextInputEditor();
      this._kindEditor = new SelectEditor(["note", "idea", "effort"], ["Note", "Idea", "Effort"], <HTMLSelectElement>this.$(".kind"));
      this._doneEditor = new CheckboxEditor(<HTMLInputElement>this.$(".done"));
      this._bodyEditor = new AceEditor();
      this._commentList = new CommentList(_ctx);

      this._titleViewer = new TextViewer(this.$('.display > .title'));
      this._bodyViewer = new MarkViewer(_ctx, this.$('.display > .body'));

      this.$(".edit > .title").appendChild(this._titleEditor.elem());
      this.$(".edit > .body").appendChild(this._bodyEditor.elem());
      this.$(".comments").appendChild(this._commentList.elem());

      this._card = new Card(this._ctx, this._cardId);
      this._kindEditor.bind(this._card, "kind");
      this._doneEditor.bind(this._card, "done");

      this._editing = true;
      this.toggleEdit();
      this.$(".edit-mode").onclick = () => { this.toggleEdit(); };

      this._commentList.setCardId(this._cardId);
    }

    release() {
      this._card.release();
      this._card = null;
    }

    private toggleEdit() {
      this._editing = !this._editing;
      if (this._editing) {
        this.$(".display").style.display = 'none';
        this.$(".edit").style.display = 'block';
        this.$(".edit-mode").textContent = "done";
        this._titleViewer.unbind();
        this._bodyViewer.unbind();
        this._titleEditor.bind(this._card, "title");
        this._bodyEditor.bind(this._card, "body");
      } else {
        this.$(".display").style.display = 'block';
        this.$(".edit").style.display = 'none';
        this.$(".edit-mode").textContent = "edit";
        this._titleEditor.unbind();
        this._bodyEditor.unbind();
        this._titleViewer.bind(this._card, "title");
        this._bodyViewer.bind(this._card, "body");
      }
    }
  }
}
