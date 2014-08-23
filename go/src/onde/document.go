package onde

import (
	"log"
	"onde/ot"
	"onde/solr"
)

var docs = make(map[string]*Document)

type Document struct {
	id      string
	srv     *ot.Server
	subs    map[string]*Connection
	updates chan docUpdate
}

type docUpdate struct {
	connId string
	subId  int
	rev    int
	ops    ot.Ops
}

// Subscribes a connection to a document, potentially loading it.
func SubscribeDoc(docId string, conn *Connection) (*Document, error) {
	// TODO: lock to avoid getting multiple copies of the same document
	doc, exists := docs[docId]
	if !exists {
		solrDoc, err := solr.GetDoc("onde", docId)
		if err != nil {
			return nil, err
		}

		bytes := []byte(*solrDoc.GetString("body"))
		doc = &Document{
			id:      docId,
			srv:     &ot.Server{Doc: (*ot.Doc)(&bytes)},
			subs:    make(map[string]*Connection),
			updates: make(chan docUpdate), // TODO: consider increasing channel size
		}
		docs[docId] = doc

		go doc.loop()
	}

	doc.subs[conn.Id()] = conn
	return doc, nil
}

// Unsubscribes a connection from the document.
func (doc *Document) Unsubscribe(connId string) {
	// TODO: drop document (and terminate goroutine when subscriptions reach zero.
	delete(doc.subs, connId)
}

// Revise a document. Its goroutine will ensure that the resulting ops
// are broadcast to all subscribers.
func (doc *Document) Revise(connId string, subId int, rev int, ops ot.Ops) {
	doc.updates <- docUpdate{connId: connId, subId: subId, rev: rev, ops: ops}
}

// Document's goroutine function. Takes care of applying ops and notifying
// subscribers.
func (doc *Document) loop() {
	for {
		update := <-doc.updates
		outops, err := doc.srv.Recv(update.rev, update.ops)
		if err != nil {
			log.Printf("error applying ops to doc %s: %s", doc.id, err)
			return
		}

		doc.broadcast(update, outops)
		doc.persist() // TODO: Total hack to update storage. Do this less aggressively.
	}
}

func (doc *Document) persist() {
	solr.UpdateDoc("onde", doc.id, string(*doc.srv.Doc), true)
}

func (doc *Document) broadcast(update docUpdate, ops ot.Ops) {
	for _, conn := range doc.subs {
		ReviseRsp{
			ConnId: update.connId,
			SubId:  update.subId,
			Rev:    update.rev,
			DocId:  doc.id,
			Ops:    ops,
		}.Send(conn.sock)
	}
}
