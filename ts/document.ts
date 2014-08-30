// Some parts adapted from github.com/mb0/lab:
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//

/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="lib/ace.d.ts" />

module onde {

  // TODO: separate properties from body.
  export class Document {
    private _status = "";
    private _wait: any[] = null;
    private _buf: any[] = null;
    private _sub: connection.DocSubscription;
    private _rev = -1;

    constructor(private _docId: string, ready: (body: string) => void, private _onchange: (ops: any[]) => void) {
      if (this._sub) {
        this.unsubscribe();
      }

      this._sub = connection.subscribeDoc(_docId,
          (rsp: SubscribeDocRsp) => {
            this._rev = rsp.Rev;
            ready(rsp.Body);
          },
          (rsp: ReviseRsp) => { this.recvOps(rsp.Ops); },
          (rsp: ReviseRsp) => { this.ackOps(rsp.Ops); }
      );
    }

    revision(): number {
      return this._rev;
    }

    unsubscribe() {
      // TODO: Check for outgoing ops and make sure they go to the server.
      this._status = "";
      this._wait = null;
      this._buf = null;
      this._rev = -1;
      this._sub.unsubscribe();
    }

    revise(ops: any[]) {
      if (this._buf !== null) {
        this._buf = ot.compose(this._buf, ops);
      } else if (this._wait !== null) {
        this._buf = ops;
      } else {
        this._wait = ops;
        this._status = "waiting";
        this._sub.revise(this._rev, ops);
      }
    }

    private recvOps(ops: any[]) {
      var res: any[] = null;
      if (this._wait !== null) {
        res = ot.transform(ops, this._wait);
        if (res[2] !== null) {
          return res[2];
        }
        ops = res[0];
        this._wait = res[1];
      }
      if (this._buf !== null) {
        res = ot.transform(ops, this._buf);
        if (res[2] !== null) {
          return res[2];
        }
        ops = res[0];
        this._buf = res[1];
      }
      this._onchange(ops);
      ++this._rev;
      this._status = "received";
    }

    private ackOps(ops: any[]) {
      var rev = this._rev + 1;
      if (this._buf !== null) {
        this._wait = this._buf;
        this._buf = null;
        this._rev = rev;
        this._status = "waiting";
        this._sub.revise(rev, this._wait);
      } else if (this._wait !== null) {
        this._wait = null;
        this._rev = rev;
        this._status = "";
      }
    }
  }
}
