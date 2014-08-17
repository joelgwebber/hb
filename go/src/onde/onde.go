package onde

import (
	"encoding/json"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	"onde/ot"
	"strings"
)

type Document struct {
	srv  *ot.Server
	subs map[string]sockjs.Session
}

func (doc *Document) broadcast(userId string, rev int, ops ot.Ops) {
	for recvId, session := range doc.subs {
		if recvId != userId {
			ReviseRsp{
				UserId: userId,
				Rev:    rev,
				Ops:    ops,
			}.Send(session)
		}
	}
}

var docs = make(map[string]*Document)

func SockHandler(session sockjs.Session) {
	log.Println("new connection: %s", session.ID())

	LoginRsp{UserId: session.ID()}.Send(session)

	var err error
	for {
		var msg string
		if msg, err = session.Recv(); err == nil {
			var req Req
			err := json.NewDecoder(strings.NewReader(msg)).Decode(&req)
			if err != nil {
				log.Printf("failed to parse req: %s", err)
				break
			}

			switch req.Type {
			case MsgSubscribe:
				doc := docs[req.Subscribe.DocId]
				doc.subs[session.ID()] = session
				SubscribeRsp{
					DocId: req.Subscribe.DocId,
					Rev:   doc.srv.Rev(),
					Doc:   string(*doc.srv.Doc),
				}.Send(session)

			case MsgRevise:
				doc := docs[req.Revise.DocId]
				outops, err := doc.srv.Recv(req.Revise.Rev, req.Revise.Ops)
				if err != nil {
					log.Printf("error handling ops: %s", err)
					break
				}
				ReviseRsp{
					UserId: session.ID(),
					Rev:    req.Revise.Rev,
					Ops:    outops,
				}.Send(session)

				doc.broadcast(session.ID(), doc.srv.Rev(), outops)
			}

			continue
		}
		break
	}

	log.Printf("lost connection %s: %s", session.ID(), err)
}

func makeDoc(docId, text string) {
	bytes := []byte(text)
	doc := &Document{
		srv: &ot.Server{
			Doc: (*ot.Doc)(&bytes),
		},
		subs: make(map[string]sockjs.Session),
	}
	docs[docId] = doc
}

func init() {
	makeDoc("foo", "Here's the foo doc.")
	makeDoc("bar", "Here's the bar doc.")
}
