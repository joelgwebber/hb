/// <reference path="carddetail.ts" />

module onde {

  export class CardDetailDialog extends Dialog {
    private _detail: CardDetail;

    onRequestClose: () => void;

    constructor(private _ctx: Context, cardId: string) {
      super("CardDetailDialog");
      this._detail = new CardDetail(_ctx, cardId);
      this.$(".container").appendChild(this._detail.elem());
      this.$('.close').onclick = () => { this.requestHide(); };
    }

    requestHide() {
      this.onRequestClose();
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
      this._detail.release();
    }
  }
}
