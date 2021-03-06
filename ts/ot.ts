// Adapted to Typescript from original ot.js source:
//
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
// Package ot is a simple version of the operation transformation library:
// ot.js (c) 2012-2013 Tim Baumann http://timbaumann.info MIT licensed.
//
module ot {

  // All the 'any[]' types are of the form:
  //   [5, -2, "text"] // retain 5, delete 2, insert "text"
  //
  // Each entry represents a single operation.
  // If op is number N it signifies:
  //   N > 0: Retain op bytes
  //   N < 0: Delete -op bytes
  //   B == 0: Noop
  // If op is string S of utf8len N:
  //   N > 0: Insert string S
  //   N == 0: Noop

  // Calculates the number of ucs2 values required to encode 'len' utf8 bytes starting at 'pos' in 's'.
  export function ucs2len(str: string, pos: number, len: number): number {
    var out = 0;
    while (len > 0) {
      len -= utf8codelen(str.charCodeAt(pos++));
      out++;
    }
    if (len != 0) {
      throw "misaligned byte length"
    }
    return out;
  }

  // Calculates the length of 'str' in utf8 bytes.
  export function utf8len(str: string): number {
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      n += utf8codelen(str.charCodeAt(i));
    }
    return n;
  }

  export function utf8codelen(c: number): number {
    if (c > 0x10000) return 4;
    else if (c > 0x800) return 3;
    else if (c > 0x80) return 2;
    return 1;
  }

  // Count returns the number of retained, deleted and inserted bytes.
  export function count(ops: any[]): number[] { // returns [ret, del, ins]
    var ret = 0, del = 0, ins = 0;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (typeof op == "string") {
        ins += utf8len(op);
      } else if (op < 0) {
        del += -op;
      } else if (op > 0) {
        ret += op;
      }
    }
    return [ret, del, ins];
  }

  // Merge attempts to merge consecutive operations the sequence.
  export function merge(ops: any[]): any[] {
    var lastop = 0;
    var res = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (!op) continue;
      var type = typeof op;
      if (type == typeof lastop && (
          type == "string" ||
          op > 0 && lastop > 0 ||
          op < 0 && lastop < 0)) {
        res[res.length - 1] = lastop + op;
      } else {
        res.push(op);
      }
      lastop = res[res.length - 1];
    }
    return res;
  }

  // Compose returns an operation sequence composed from the consecutive ops a and b.
  export function compose(a: any[], b: any[]): any[] {
    if (!a || !b) {
      throw "Compose requires nonempty ops.";
    }
    var acount = count(a), bcount = count(b);
    if (acount[0] + acount[2] != bcount[0] + bcount[1]) {
      throw "Compose requires consecutive ops.";
    }
    var res = [];
    var ia = 0, ib = 0;
    var oa = a[ia++], ob = b[ib++];
    while (!!oa || !!ob) {
      var ta = typeof oa;
      if (ta == "number" && oa < 0) { // delete a
        res.push(oa);
        oa = a[ia++];
        continue;
      }
      var tb = typeof ob;
      if (tb == "string") { // insert b
        res.push(ob);
        ob = b[ib++];
        continue;
      }
      if (!oa || !ob || tb != "number") {
        throw "Compose encountered a short operation sequence.";
      }
      var od;
      if (ta == tb && oa > 0 && ob > 0) { // both retain
        od = oa - ob;
        if (od > 0) {
          oa -= ob;
          res.push(ob);
          ob = b[ib++];
        } else if (od < 0) {
          ob -= oa;
          res.push(oa);
          oa = a[ia++];
        } else {
          res.push(oa);
          oa = a[ia++];
          ob = b[ib++];
        }
      } else if (ta == "string" && ob < 0) { // insert delete
        od = utf8len(oa) + ob;
        if (od > 0) {
          oa = oa.substr(-ob);
          ob = b[ib++];
        } else if (od < 0) {
          ob = od;
          oa = a[ia++];
        } else {
          oa = a[ia++];
          ob = b[ib++];
        }
      } else if (ta == "string" && ob > 0) { // insert retain
        od = utf8len(oa) - ob;
        if (od > 0) {
          res.push(oa.substr(0, ob));
          oa = oa.substr(ob);
          ob = b[ib++];
        } else if (od < 0) {
          ob = -od;
          res.push(oa);
          oa = a[ia++];
        } else {
          res.push(oa);
          oa = a[ia++];
          ob = b[ib++];
        }
      } else if (ta == tb && oa > 0 && ob < 0) { // retain delete
        od = oa + ob;
        if (od > 0) {
          oa += ob;
          res.push(ob);
          ob = b[ib++];
        } else if (od < 0) {
          ob += oa;
          res.push(oa * -1);
          oa = a[ia++];
        } else {
          res.push(ob);
          oa = a[ia++];
          ob = b[ib++];
        }
      } else {
        throw "This should never have happened.";
      }
    }
    return merge(res);
  }

  // Transform returns two operation sequences derived from the concurrent ops a and b.
  export function transform(a: any[], b: any[]): any[] { // returns [a1, b1]
    if (!a || !b) {
      return [a, b];
    }
    var acount = count(a), bcount = count(b);
    if (acount[0] + acount[1] != bcount[0] + bcount[1]) {
      throw "Transform requires concurrent ops.";
    }
    var a1 = [], b1 = [];
    var ia = 0, ib = 0;
    var oa = a[ia++], ob = b[ib++];
    while (!!oa || !!ob) {
      var ta = typeof oa;
      if (ta == "string") { // insert a
        a1.push(oa);
        b1.push(utf8len(oa));
        oa = a[ia++];
        continue;
      }
      var tb = typeof ob;
      if (tb == "string") { // insert b
        a1.push(utf8len(ob));
        b1.push(ob);
        ob = b[ib++];
        continue;
      }
      if (!oa || !ob || ta != "number" || tb != ta) {
        throw "Compose encountered a short operation sequence.";
      }
      var od, om;
      if (oa > 0 && ob > 0) { // both retain
        od = oa - ob;
        if (od > 0) {
          om = ob;
          oa -= ob;
          ob = b[ib++];
        } else if (od < 0) {
          om = oa;
          ob -= oa;
          oa = a[ia++];
        } else {
          om = oa;
          oa = a[ia++];
          ob = b[ib++];
        }
        a1.push(om);
        b1.push(om);
      } else if (oa < 0 && ob < 0) { // both delete
        od = -oa + ob;
        if (od > 0) {
          oa -= ob;
          ob = b[ib++];
        } else if (od < 0) {
          ob -= oa;
          oa = a[ia++];
        } else {
          oa = a[ia++];
          ob = b[ib++];
        }
      } else if (oa < 0 && ob > 0) { // delete retain
        od = -oa - ob;
        if (od > 0) {
          om = -ob;
          oa += ob;
          ob = b[ib++];
        } else if (od < 0) {
          om = oa;
          ob += oa;
          oa = a[ia++];
        } else {
          om = oa;
          oa = a[ia++];
          ob = b[ib++];
        }
        a1.push(om);
      } else if (oa > 0 && ob < 0) { // retain delete
        od = oa + ob;
        if (od > 0) {
          om = ob;
          oa += ob;
          ob = b[ib++];
        } else if (od < 0) {
          om = -oa;
          ob += oa;
          oa = a[ia++];
        } else {
          om = -oa;
          oa = a[ia++];
          ob = b[ib++];
        }
        b1.push(om);
      } else {
        throw "Transform failed with incompatible operation sequences.";
      }
    }
    return [merge(a1), merge(b1)];
  }
}
