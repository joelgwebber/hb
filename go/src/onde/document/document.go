package document

import (
	"fmt"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	"math/rand"
	. "onde/api"
	"onde/ot"
	"onde/solr"
	"strconv"
	"strings"
)

var master struct {
	docs   map[string]*Document
	subs   chan subReq
	unsubs chan unsubReq
}

type subReq struct {
	docId    string
	connId   string
	subId    int
	sock     sockjs.Session
	response chan<- *Document
}

type unsubReq struct {
	doc    *Document
	connId string
	subId  int
}

func init() {
	master.docs = make(map[string]*Document)
	master.subs = make(chan subReq)
	master.unsubs = make(chan unsubReq)
	go run()
}

// Main document subscription loop. Controls access to Document structs via the un[subs] channels.
func run() {
	done := make(chan *Document)

	for {
		select {
		case req := <-master.subs:
			doc, exists := master.docs[req.docId]
			if !exists {
				var err error
				doc, err = newDocument(req.docId, done)
				if err != nil {
					// TODO: something.
					continue
				}
				master.docs[req.docId] = doc
			}
			doc.subs <- req
			req.response <- doc
			log.Printf("%d docs total", len(master.docs))

		case req := <-master.unsubs:
			req.doc.unsubs <- req

		case doc := <-done:
			delete(master.docs, doc.id)
			log.Printf("%d docs total", len(master.docs))
		}
	}
}

type Document struct {
	id            string
	srv           *ot.Server
	subscriptions map[string]sockjs.Session
	subs          chan subReq
	unsubs        chan unsubReq
	updates       chan docUpdate
}

type docUpdate struct {
	connId string
	subId  int
	rev    int
	ops    ot.Ops
}

func newDocument(docId string, done chan<- *Document) (*Document, error) {
	solrDoc, err := solr.GetDoc("onde", docId)
	if err != nil {
		return nil, err
	}

	bytes := []byte(*solrDoc.GetString("body"))
	doc := &Document{
		id:            docId,
		srv:           &ot.Server{Doc: (*ot.Doc)(&bytes)},
		subscriptions: make(map[string]sockjs.Session),
		subs:          make(chan subReq),
		unsubs:        make(chan unsubReq),
		updates:       make(chan docUpdate), // TODO: consider increasing channel size
	}
	go doc.run(done)

	return doc, nil
}

// Creates a new, empty document.
func Create() (docId string, err error) {
	// TODO: WILL NOT WORK FOR LONG.
	docId = strconv.FormatInt(rand.Int63(), 10)

	if err = solr.UpdateDoc("onde", docId, "", true); err != nil {
		return "", err
	}

	return
}

// Subscribes to a document, potentially loading it.
func Subscribe(docId string, connId string, subId int, sock sockjs.Session) (*Document, error) {
	rsp := make(chan *Document)
	master.subs <- subReq{docId: docId, connId: connId, subId: subId, sock: sock, response: rsp}
	return <-rsp, nil
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
	master.unsubs <- unsubReq{doc: doc, connId: connId, subId: subId}
	log.Printf("[%d] unsub doc %s: %s/%d", len(doc.subscriptions), doc.id, connId, subId)
}

// Revise a document. Its goroutine will ensure that the resulting ops
// are broadcast to all subscribers.
func (doc *Document) Revise(connId string, subId int, rev int, ops ot.Ops) {
	doc.updates <- docUpdate{connId: connId, subId: subId, rev: rev, ops: ops}
}

// Main loop for each open Document. Maintains access to subscriptions via the subs/unsubs channels.
func (doc *Document) run(done chan<- *Document) {
	for {
		select {
		case req := <-doc.subs:
			doc.subscriptions[subKey(req.connId, req.subId)] = req.sock
			log.Printf("[%d] sub doc %s: %s", len(doc.subs), req.docId, req.connId)

		case req := <-doc.unsubs:
			delete(doc.subscriptions, subKey(req.connId, req.subId))
			if len(doc.subscriptions) == 0 {
				log.Printf("dropping doc %s: %s", doc.id, req.connId)
				done <- doc
				return
			}
			log.Printf("[%d] unsub doc %s: %s", len(doc.subs), doc.id, req.connId)

		case update := <-doc.updates:
			outops, err := doc.srv.Recv(update.rev, update.ops)
			if err != nil {
				log.Printf("error applying ops to doc %s: %s", doc.id, err)
				return
			}
			doc.broadcast(update, outops)
			doc.persist() // TODO: Persist less aggressively.
		}
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
	for key, sock := range doc.subscriptions {
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
