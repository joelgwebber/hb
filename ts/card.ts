// Some parts adapted from github.com/mb0/lab:
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//

/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="lib/ace.d.ts" />

module onde {

  export interface Binding {
    onReady: (value: string) => void;
    onChange: (ops: any[]) => void;
    revise: (ops: any[]) => void;
    release: () => void;
  }

  // Client-side card abstraction. Maintains subscription to server-side card, along with
  // OT bookkeeping. Also maintains the property list at the beginning of the card, hiding it
  // from users so they don't see it as part of the card body.
  //
  // A new Card class must be instantiated for each doc-id, and release() must
  // be called when discarding an instance (otherwise it will leak subscriptions until the connection
  // is lost).
  export class Card {
//    private _status = "";
    private _wait: {[prop: string]: any[]} = {};
    private _buf: {[prop: string]: any[]} = {};
    private _props: {[prop: string]: string} = {};
    private _sub: connection.CardSubscription;
    private _rev = -1;
    private _bindings: {[prop: string]: Binding} = {};

    constructor(private _docId: string) {
      this._sub = connection.subscribeCard(_docId,
          (rsp: SubscribeCardRsp) => {
            this._rev = rsp.Rev;
            this._props = rsp.Props;
            this.subscribed();
          },
          (rsp: ReviseRsp) => {
            this.recvOps(rsp.Change);
          },
          (rsp: ReviseRsp) => {
            this.ackOps(rsp.Change);
          }
      );
    }

    bind(prop: string, onReady: (value: string) => void, onChange: (ops: any[]) => void): Binding {
      if (prop in this._bindings) {
        throw "multiple bindings to " + prop;
      }

      var binding = {
        onReady: onReady,
        onChange: onChange,
        revise: (ops: any[]) => {
          this.revise({ Prop: prop, Ops: ops });
        },
        release: () => {
          binding.revise = null;
          binding.release = null;
          delete this._bindings[prop];
        }
      };
      this._bindings[prop] = binding;

      // If the subscription's already ready, call onReady() immediately.
      if (this._rev >= 0) {
        onReady(this.prop(prop));
        binding.onReady = null;
      }

      return binding;
    }

    // The current card revision. Any mutation to the card will bump this value.
    revision(): number {
      return this._rev;
    }

    // The card's given property, by name.
    // Non-existent properties return "". Revisions automatically bring new properties into existence.
    prop(key: string): string {
      if (!(key in this._props)) {
        return "";
      }
      return this._props[key];
    }

    // Must be called when done with a card instance.
    release() {
      // TODO: Check for outgoing ops and make sure they go to the server.
//      this._status = "";
      this._wait = {};
      this._buf = {};
      this._rev = -1;
      this._sub.unsubscribe();
    }

    private subscribed() {
      // Call back into all waiting bindings to let them know the subscription is ready.
      for (var prop in this._bindings) {
        var binding = this._bindings[prop];
        if (binding.onReady) {
          binding.onReady(this.prop(prop));
          binding.onReady = null;
        }
      }
    }

    // Revise this card with OT ops (as defined in ot.ts).
    private revise(change: Change) {
      if (this._buf[change.Prop]) {
        this._buf[change.Prop] = ot.compose(this._buf[change.Prop], change.Ops);
      } else if (this._wait[change.Prop]) {
        this._buf[change.Prop] = change.Ops;
      } else {
        this._wait[change.Prop] = change.Ops;
//        this._status = "waiting";
        this._sub.revise(this._rev, change);
      }
    }

    private recvOps(change: Change) {
      var res: any[] = null;
      if (this._wait[change.Prop]) {
        res = ot.transform(change.Ops, this._wait[change.Prop]);
        change.Ops = res[0];
        this._wait[change.Prop] = res[1];
      }
      if (this._buf[change.Prop]) {
        res = ot.transform(change.Ops, this._buf[change.Prop]);
        change.Ops = res[0];
        this._buf[change.Prop] = res[1];
      }

      this.apply(change);
      ++this._rev;
//      this._status = "received";
    }

    private ackOps(change: Change) {
      this.updateProp(change);
      ++this._rev;

      if (this._buf[change.Prop]) {
        this._wait[change.Prop] = this._buf[change.Prop];
        this._buf = {};
//        this._status = "waiting";
        this._sub.revise(this._rev, {
          Prop: change.Prop,
          Ops: this._wait[change.Prop]
        });
      } else if (this._wait[change.Prop]) {
        this._wait[change.Prop] = null;
//        this._status = "";
      }
    }

    private apply(change: Change) {
      this.updateProp(change);
      var binding = this._bindings[change.Prop];
      if (binding) {
        binding.onChange(change.Ops);
      }
    }

    private updateProp(change: Change) {
      var pos = 0;
      var text = "";
      for (var i = 0; i < change.Ops.length; ++i) {
        var op = change.Ops[i];
        if (typeof op == "string") {
          text = text + op;
        } else if (op > 0) {
          var len = ot.ucs2len(this._props[change.Prop], pos, <number> op);
          text += this._props[change.Prop].slice(pos, pos + len);
          pos += len;
        } else if (op < 0) {
          var len = ot.ucs2len(this._props[change.Prop], pos, <number> -op);
          pos += len;
        }
      }
      this._props[change.Prop] = text;
    }
  }
}
