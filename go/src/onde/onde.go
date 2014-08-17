package onde

import (
	"encoding/json"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	"onde/ot"
	"strings"
)

var srv *ot.Server
var subs = make(map[string]sockjs.Session)

func broadcast(userId string, rev int, ops ot.Ops) {
	for recvId, session := range subs {
		if recvId != userId {
			ReviseRsp{
				UserId: userId,
				Rev:    rev,
				Ops:    ops,
			}.Send(session)
		}
	}
}

func SockHandler(session sockjs.Session) {
	log.Println("new connection: %s", session.ID())

	subs[session.ID()] = session
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
				SubscribeRsp{
					DocId: req.Subscribe.DocId,
					Rev:   srv.Rev(),
					Doc:   string(*srv.Doc),
				}.Send(session)

			case MsgRevise:
				outops, err := srv.Recv(req.Revise.Rev, req.Revise.Ops)
				if err != nil {
					log.Printf("error handling ops: %s", err)
					break
				}
				ReviseRsp{
					UserId: session.ID(),
					Rev:    req.Revise.Rev,
					Ops:    outops,
				}.Send(session)

				broadcast(session.ID(), srv.Rev(), outops)
			}

			continue
		}
		break
	}

	log.Printf("lost connection %s: %s", session.ID(), err)
}

func init() {
	doc := []byte("Here's a doc, yo")
	srv = &ot.Server{
		Doc: (*ot.Doc)(&doc),
	}
}
