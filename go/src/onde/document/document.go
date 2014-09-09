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
	"onde/api"
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
	props         map[string]*ot.Doc
	history       []api.Change
	subscriptions map[string]sockjs.Session
	subs          chan subReq
	unsubs        chan unsubReq
	updates       chan docUpdate
}

type docUpdate struct {
	connId string
	subId  int
	rev    int
	change api.Change
}

func newDocument(docId string, done chan<- *Document) (*Document, error) {
	doc := &Document{
		id:            docId,
		props:         make(map[string]*ot.Doc),
		history:       make([]api.Change, 0),
		subscriptions: make(map[string]sockjs.Session),
		subs:          make(chan subReq),
		unsubs:        make(chan unsubReq),
		updates:       make(chan docUpdate), // TODO: consider increasing channel size
	}

	// TODO: I don't like the way we're dealing with JsonObject here.
	// Consider ditching it and just keeping its little 'get-walker' as a helper func.
	solrDoc, err := solr.GetDoc("onde", docId)
	if err != nil {
		return nil, err
	}
	solrMap := map[string]interface{}(solrDoc)
	for k, v := range solrMap {
		if strings.HasPrefix(k, "prop_") {
			value := ot.NewDoc(v.(string))
			doc.props[k[5:]] = &value
		}
	}

	go doc.run(done)
	return doc, nil
}

// Creates a new, empty document.
func Create() (docId string, err error) {
	// TODO: WILL NOT WORK FOR LONG.
	docId = strconv.FormatInt(rand.Int63(), 10)

	empty := ot.NewDoc("")
	if err = solr.UpdateDoc("onde", docId, map[string]*ot.Doc{ "body": &empty, }, true); err != nil {
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

// Receives a change, transforms and applies it, returning the transformed change.
// Sending the updated change to connected clients is the caller's responsibility.
func (doc *Document) Recv(rev int, change api.Change) (api.Change, error) {
	if rev < 0 || len(doc.history) < rev {
		return api.Change{}, fmt.Errorf("Revision not in history")
	}

	var err error
	outops := change.Ops

	// Transform ops against all operations that happened since rev.
	for _, other := range doc.history[rev:] {
		if other.Prop == change.Prop {
			if outops, _, err = ot.Transform(change.Ops, other.Ops); err != nil {
				return api.Change{}, err
			}
		}
	}

	// Get the propery's doc, initializing it if absent.
	// TODO: Should we delete doc entries when they become empty, or only do it during serialization?
	prop, exists := doc.props[change.Prop]
	if !exists {
		empty := ot.NewDoc("")
		prop = &empty
		doc.props[change.Prop] = prop
	}

	// Apply to document.
	if err = prop.Apply(change.Ops); err != nil {
		return api.Change{}, err
	}
	doc.history = append(doc.history, change)
	return api.Change{Prop: change.Prop, Ops: outops}, nil
}

// Gets the current document revision.
func (doc *Document) Rev() int {
	return len(doc.history)
}

// Gets the document's id.
func (doc *Document) Id() string {
	return doc.id
}

// Gets all the document's properties as strings.
func (doc *Document) Props() map[string]string {
	var props = make(map[string]string)
	for k, v := range doc.props {
		props[k] = v.String()
	}
	return props
}

// Unsubscribes a connection from the document.
func (doc *Document) Unsubscribe(connId string, subId int) {
	master.unsubs <- unsubReq{doc: doc, connId: connId, subId: subId}
	log.Printf("[%d] unsub doc %s: %s/%d", len(doc.subscriptions), doc.id, connId, subId)
}

// Revise a document. Its goroutine will ensure that the resulting ops
// are broadcast to all subscribers.
func (doc *Document) Revise(connId string, subId int, rev int, change api.Change) {
	doc.updates <- docUpdate{connId: connId, subId: subId, rev: rev, change: change}
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
			outchange, err := doc.Recv(update.rev, update.change)
			if err != nil {
				log.Printf("error applying ops to doc %s: %s", doc.id, err)
				return
			}
			doc.broadcast(update, outchange)
			doc.persist() // TODO: Persist less aggressively.
		}
	}
}

func (doc *Document) broadcast(update docUpdate, change api.Change) {
	rsp := ReviseRsp{
		OrigConnId: update.connId,
		OrigSubId:  update.subId,
		Rev:        update.rev,
		DocId:      doc.id,
		Change:     change,
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

func (doc *Document) persist() {
	solr.UpdateDoc("onde", doc.id, doc.props, true)
}

func subKey(connId string, subId int) string {
	return fmt.Sprintf("%s:%d", connId, subId)
}

func connIdFromKey(key string) int {
	parts := strings.Split(key, ":")
	subId, _ := strconv.ParseInt(parts[1], 10, 32)
	return int(subId)
}
