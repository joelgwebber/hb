package main

import (
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"net/http"
	"log"
	"onde/ot"
	"encoding/json"
	"strings"
	"bytes"
)

var srv *ot.Server
var subs = make(map[string]sockjs.Session)

type Req struct {
	Type      string
	Revise    *ReviseReq
	Subscribe *SubscribeReq
}

type SubscribeReq struct {
	DocId string
}

type ReviseReq struct {
	Rev int
	Ops ot.Ops
}

type Rsp struct {
	Type      string
	Login     *LoginRsp
	Subscribe *SubscribeRsp
	Revise    *ReviseRsp
}

type SubscribeRsp struct {
	DocId string
	Rev   int
	Doc   string
}

type LoginRsp struct {
	UserId string
}

type ReviseRsp struct {
	UserId string
	Rev    int
	Ops    ot.Ops
}

func sendRsp(session sockjs.Session, rsp *Rsp) error {
	buf := &bytes.Buffer{};
	if err := json.NewEncoder(buf).Encode(rsp); err != nil {
		return err
	}
	return session.Send(buf.String())
}

func sendLoginRsp(session sockjs.Session, userId string) error {
	return sendRsp(session, &Rsp{
			Type: "login",
			Login: &LoginRsp{ UserId: userId },
		})
}

func sendSubscribeRsp(session sockjs.Session, docId string, rev int, doc string) error {
	return sendRsp(session, &Rsp{
			Type: "subscribe",
			Subscribe: &SubscribeRsp{ DocId: docId, Rev: rev, Doc: doc },
		})
}

func sendReviseRsp(session sockjs.Session, userId string, rev int, ops ot.Ops) error {
	return sendRsp(session, &Rsp{
			Type: "revise",
			Revise: &ReviseRsp{ UserId: userId, Rev: rev, Ops: ops },
		})
}

func broadcast(userId string, rev int, ops ot.Ops) {
	for recvId, session := range subs {
		if recvId != userId {
			sendReviseRsp(session, userId, rev, ops)
		}
	}
}

func sockHandler(session sockjs.Session) {
	log.Println("new connection: %s", session.ID())

	subs[session.ID()] = session
	sendLoginRsp(session, session.ID())

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
			case "subscribe":
				sendSubscribeRsp(session, req.Subscribe.DocId, srv.Rev(), string(*srv.Doc))

			case "revise":
				outops, err := srv.Recv(req.Revise.Rev, req.Revise.Ops)
				if err != nil {
					log.Printf("error handling ops: %s", err)
					break
				}
				sendReviseRsp(session, session.ID(), req.Revise.Rev, outops)

				broadcast(session.ID(), srv.Rev(), outops)
			}

			continue
		}
		break
	}

	log.Printf("lost connection %s: %s", session.ID(), err)
}

func main() {
	doc := []byte("Here's a doc, yo")
	srv = &ot.Server{
		Doc: (*ot.Doc)(&doc),
	}

	http.Handle("/sock/", sockjs.NewHandler("/sock", sockjs.DefaultOptions, sockHandler))
	http.Handle("/", http.FileServer(http.Dir("pub")))
	log.Fatal(http.ListenAndServe(":8080", nil))
}
