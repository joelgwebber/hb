package onde

import (
	"fmt"
	"log"
	"onde/ot"
	"onde/solr"
	"strconv"
	"strings"
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
func SubscribeDoc(docId string, conn *Connection, subId int) (*Document, error) {
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

	doc.subs[subKey(conn.Id(), subId)] = conn
	return doc, nil
}

// Unsubscribes a connection from the document.
func (doc *Document) Unsubscribe(connId string, subId int) {
	// TODO: drop document (and terminate goroutine when subscriptions reach zero.
	delete(doc.subs, subKey(connId, subId))
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
	rsp := ReviseRsp{
		OrigConnId: update.connId,
		OrigSubId:  update.subId,
		Rev:        update.rev,
		DocId:      doc.id,
		Ops:        ops,
	}
	conns := make(map[*Connection][]int)
	for key, conn := range doc.subs {
		conns[conn] = append(conns[conn], connIdFromKey(key))
	}
	for conn, _ := range conns {
		rsp.SubIds = conns[conn]
		rsp.Send(conn.sock)
	}
}

func subKey(connId string, subId int) string {
	return fmt.Sprintf("%s:%d", connId, subId)
}

func connIdFromKey(key string) int {
	parts := strings.Split(key, ":")
	subId, _ := strconv.ParseInt(parts[1], 10, 32)
	return int(subId)
}
