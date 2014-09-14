/// <reference path="editors.ts" />
/// <reference path="card.ts" />

module onde {

  export class CardDetail extends Dialog {
    private _titleViewer: TextViewer;
    private _bodyViewer: TextViewer;
    private _titleEditor: TextInputEditor;
    private _bodyEditor: AceEditor;
    private _doneEditor: CheckboxEditor;
    private _commentList: CommentList;
    private _card: Card;
    private _editing = false;

    constructor(private _ctx: Context, private _cardId: string) {
      super("CardDetail");

      this._titleEditor = new TextInputEditor();
      this._doneEditor = new CheckboxEditor();
      this._bodyEditor = new AceEditor();
      this._commentList = new CommentList(_ctx);

      this._titleViewer = new TextViewer(this.$('.display > .title'));
      this._bodyViewer = new TextViewer(this.$('.display > .body'));

      this.$(".edit > .title").appendChild(this._titleEditor.elem());
      this.$(".edit > .body").appendChild(this._bodyEditor.elem());
      this.$(".done-label").insertBefore(this._doneEditor.elem(), this.$(".done-label").firstChild);
      this.$(".comments").appendChild(this._commentList.elem());

      this._card = new Card(this._ctx, this._cardId);
      this._doneEditor.bind(this._card, "done");

      this._editing = true;
      this.toggleEdit();
      this.$(".edit-mode").onclick = (e) => { this.toggleEdit(); };

      this._commentList.setCardId(this._cardId);
    }

    show() {
      if (this.showing()) {
        return;
      }
      super.show();
    }

    hide() {
      if (!this.showing()) {
        return;
      }
      super.hide();
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
