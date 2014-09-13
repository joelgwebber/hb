// Adapted from github.com/mb0/lab. Original copyright below.
//
// Copyright 2013 Martin Schnabel. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
package ot

import (
	"fmt"
)

// Doc represents a text document.
type Doc []byte

func NewDoc(text string) *Doc {
	doc := Doc([]byte(text))
	return &doc
}

func (doc Doc) String() string {
	return string(doc)
}

// Apply applies the operation sequence ops to the document.
// An error is returned if applying ops failed.
func (doc *Doc) Apply(ops Ops) error {
	i, buf := 0, *doc
	ret, del, ins := ops.Count()
	if ret+del != len(buf) {
		return fmt.Errorf("The base length must be equal to the document length %d != %d", ret+del, len(buf))
	}
	if max := ret + del + ins; max > cap(buf) {
		nbuf := make([]byte, len(buf), max+(max>>2))
		copy(nbuf, buf)
		buf = nbuf
	}
	for _, op := range ops {
		switch {
		case op.N > 0:
			i += op.N
		case op.N < 0:
			copy(buf[i:], buf[i-op.N:])
			buf = buf[:len(buf)+op.N]
		case op.S != "":
			l := len(buf)
			buf = buf[:l+len(op.S)]
			copy(buf[i+len(op.S):], buf[i:l])
			buf = append(buf[:i], op.S...)
			buf = buf[:l+len(op.S)]
			i += len(op.S)
		}
	}
	*doc = buf
	if i != ret+ins {
		panic("Operation didn't operate on the whole document")
	}
	return nil
}

// TODO: resurrect this with support for multi-prop docs.
//
//// Client represent a client document with synchronization mechanisms.
//// The client has three states:
////    1. A synchronized client sends applied ops immediately and …
////    2. waits for an acknowledgement from the server, meanwhile buffering applied ops.
////    3. The buffer is composed with new ops and sent immediately when the pending ack arrives.
//type Client struct {
//	Doc  *Doc // the document
//	Rev  int  // last acknowledged revision
//	Wait Ops  // pending ops or nil
//	Buf  Ops  // buffered ops or nil
//	// Send is called when a new revision can be sent to the server.
//	Send func(rev int, ops Ops)
//}
//
//// Apply applies ops to the document and buffers or sends the server update.
//// An error is returned if the ops could not be applied.
//func (c *Client) Apply(ops Ops) error {
//	var err error
//	if err = c.Doc.Apply(ops); err != nil {
//		return err
//	}
//	switch {
//	case c.Buf != nil:
//		if c.Buf, err = Compose(c.Buf, ops); err != nil {
//			return err
//		}
//	case c.Wait != nil:
//		c.Buf = ops
//	default:
//		c.Wait = ops
//		c.Send(c.Rev, ops)
//	}
//	return nil
//}
//
//// Ack acknowledges a pending server update and sends buffered updates if any.
//// An error is returned if no update is pending.
//func (c *Client) Ack() error {
//	switch {
//	case c.Buf != nil:
//		c.Send(c.Rev+1, c.Buf)
//		c.Wait, c.Buf = c.Buf, nil
//	case c.Wait != nil:
//		c.Wait = nil
//	default:
//		return fmt.Errorf("no pending operation")
//	}
//	c.Rev++
//	return nil
//}
//
//// Recv receives server updates originating from other participants.
//// An error is returned if the server update could not be applied.
//func (c *Client) Recv(ops Ops) error {
//	var err error
//	if c.Wait != nil {
//		if ops, c.Wait, err = Transform(ops, c.Wait); err != nil {
//			return err
//		}
//	}
//	if c.Buf != nil {
//		if ops, c.Buf, err = Transform(ops, c.Buf); err != nil {
//			return err
//		}
//	}
//	if err = c.Doc.Apply(ops); err != nil {
//		return err
//	}
//	c.Rev++
//	return nil
//}
