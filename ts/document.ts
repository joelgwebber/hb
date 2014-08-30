// Some parts adapted from github.com/mb0/lab:
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//

/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="lib/ace.d.ts" />

module onde {

  // Client-side document abstraction. Maintains subscription to server-side document, along with
  // OT bookkeeping. Also maintains the property list at the beginning of the document, hiding it
  // from users so they don't see it as part of the document body.
  //
  // A new Document class must be instantiated for each doc-id, and release() must
  // be called when discarding an instance (otherwise it will leak subscriptions until the connection
  // is lost).
  export class Document {
    private _status = "";
    private _wait: any[] = null;
    private _buf: any[] = null;
    private _sub: connection.DocSubscription;

    private _body = "";
    private _rev = -1;

    private _props: {key: string; value: string;}[] = [];
    private _bodyOfs = 0;

    constructor(private _docId: string, ready: (body: string) => void, private _onchange: (ops: any[]) => void) {
      this._sub = connection.subscribeDoc(_docId,
          (rsp: SubscribeDocRsp) => {
            this._rev = rsp.Rev;
            this._body = rsp.Body;
            this.parseProperties();
            ready(rsp.Body);
          },
          (rsp: ReviseRsp) => {
            this.recvOps(rsp.Ops);
          },
          (rsp: ReviseRsp) => {
            this.ackOps(rsp.Ops);
          }
      );
    }

    // The current document revision. Any mutation to the document will bump this value.
    revision(): number {
      return this._rev;
    }

    body(): string {
      return this._body;
    }

    // Must be called when done with a document instance.
    release() {
      // TODO: Check for outgoing ops and make sure they go to the server.
      this._status = "";
      this._wait = null;
      this._buf = null;
      this._rev = -1;
      this._sub.unsubscribe();
    }

    // Revise this document with OT ops (as defined in ot.ts).
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

      this.applyOps(ops);
      ++this._rev;
      this._status = "received";
    }

    private ackOps(ops: any[]) {
      this.updateBody(ops);
      ++this._rev;

      if (this._buf !== null) {
        this._wait = this._buf;
        this._buf = null;
        this._status = "waiting";
        this._sub.revise(this._rev, this._wait);
      } else if (this._wait !== null) {
        this._wait = null;
        this._status = "";
      }
    }

    private applyOps(ops: any[]) {
      this.updateBody(ops);
      this._onchange(ops);
    }

    private updateBody(ops: any[]) {
      var pos = 0;
      var body = "";
      for (var i = 0; i < ops.length; ++i) {
        var op = ops[i];
        if (typeof op == "string") {
          body = body + op;
        } else if (op > 0) {
          var len = ot.ucs2len(this._body, pos, <number> op);
          body += this._body.slice(pos, pos + len);
          pos += len;
        } else if (op < 0) {
          var len = ot.ucs2len(this._body, pos, <number> -op);
          pos += len;
        }
      }
      this._body = body;

      // TODO: Optimization: Keep track of body start index and use this to early out on property parsing.
      this.parseProperties();
    }

    private parseProperties() {
      this._props = [];

      var i = 0, state = 0;
      var keyStart: number, valueStart: number;
      var key: string;

    loop:
      for (i = 0; i < this._body.length; ++i) {
        var ch = this._body[i];
        switch (state) {
        case 0: // start
          if (ch == '{') {
            state = 1;
            keyStart = i + 1;
          }
          break;

        case 1: // key
          switch (ch) {
          case ':':
            key = this._body.slice(keyStart, i).trim();
            valueStart = i + 1;
            state = 2;
            break;
          case '}':
            break loop;
          }
          break;

        case 2: // value
          switch (ch) {
          case '\n':
            var value = this._body.slice(valueStart, i).trim();
            var prop = {key: key, value: value};
            this._props.push(prop);
            state = 1;
            keyStart = i + 1;
            break;
          case '}':
            break loop;
          }
        }
      }

      // Optionally trim trailing CR before body.
      i++;
      if (i < this._body.length-1 && this._body[i] == '\n') {
        i++;
      }

      this._bodyOfs = i;
    }
  }
}
