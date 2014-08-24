package document

import (
	"fmt"
	"log"
	"onde/ot"
	"onde/solr"
	"strconv"
	"strings"
	"math/rand"
	. "onde/api"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
)

var docs = make(map[string]*Document)

type Document struct {
	id      string
	srv     *ot.Server
	subs    map[string]sockjs.Session
	updates chan docUpdate
}

type docUpdate struct {
	connId string
	subId  int
	rev    int
	ops    ot.Ops
}

func Create() (string, error) {
	// TODO: WILL NOT WORK FOR LONG.
	docId := strconv.FormatInt(rand.Int63(), 10)

	if err := solr.UpdateDoc("onde", docId, "", true); err != nil {
		return "", err
	}

	return docId, nil
}

// Subscribes to a document, potentially loading it.
func Subscribe(docId string, connId string, subId int, sock sockjs.Session) (*Document, error) {
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
			subs:    make(map[string]sockjs.Session),
			updates: make(chan docUpdate), // TODO: consider increasing channel size
		}
		docs[docId] = doc

		go doc.loop()
	}

	doc.subs[subKey(connId, subId)] = sock
	log.Printf("[%d] sub doc %s: %s/%d", len(doc.subs), docId, connId, subId)
	return doc, nil
}

// Gets the current document revision.
func (doc *Document) Rev() int {
	return doc.srv.Rev()
}

// Gets the current document text.
func (doc *Document) Text() string {
	return string(*doc.srv.Doc)
}

// Unsubscribes a connection from the document.
func (doc *Document) Unsubscribe(connId string, subId int) {
	// TODO: drop document (and terminate goroutine) when subscriptions reach zero.
	delete(doc.subs, subKey(connId, subId))
	log.Printf("[%d] unsub doc %s: %s/%d", len(doc.subs), doc.id, connId, subId)
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

		doc.persist() // TODO: Persist less aggressively.
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
	socks := make(map[sockjs.Session][]int)
	for key, sock := range doc.subs {
		socks[sock] = append(socks[sock], connIdFromKey(key))
	}
	for sock, _ := range socks {
		rsp.SubIds = socks[sock]
		rsp.Send(sock)
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
