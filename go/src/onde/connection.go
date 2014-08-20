package onde

import (
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"fmt"
	"log"
	"strings"
	"encoding/json"
)

type Connection struct {
	user *User
	sock sockjs.Session
	subs map[string]*Document // docId -> Document
}

func makeConnection(user *User, sock sockjs.Session) *Connection {
	return &Connection{
		user: user,
		sock: sock,
		subs: make(map[string]*Document),
	}
}

func (conn *Connection) Id() string {
	return conn.sock.ID()
}

func (conn *Connection) validate(sock sockjs.Session) bool {
	if conn == nil {
		ErrorRsp{ Msg: "no connection" }.Send(sock)
		return false
	}
	return true
}

func (conn *Connection) addSub(doc *Document) {
	conn.subs[doc.id] = doc
	doc.addSub(conn)
}

func (conn *Connection) handleSubscribe(req *SubscribeReq) {
	if _, exists := conn.subs[req.DocId]; exists {
		ErrorRsp{ Msg: fmt.Sprintf("double subscribe: %s", req.DocId) }.Send(conn.sock)
		return
  }

	doc, err := GetDocument(req.DocId)
	if err != nil {
		ErrorRsp{ Msg: fmt.Sprintf("no such document: %s", req.DocId) }.Send(conn.sock)
		return
	}

	conn.addSub(doc)
	SubscribeRsp{
		DocId: req.DocId,
		Rev:   doc.srv.Rev(),
		Doc:   string(*doc.srv.Doc),
	}.Send(conn.sock)
}

func (conn *Connection) handleRevise(req *ReviseReq) {
	doc := docs[req.DocId]
	outops, err := doc.srv.Recv(req.Rev, req.Ops)
	if err != nil {
		ErrorRsp{ Msg: fmt.Sprintf("error handling ops: %s", err) }.Send(conn.sock)
		return
	}

	ReviseRsp{
		ConnId: conn.sock.ID(),
		Rev:    req.Rev,
		Ops:    outops,
	}.Send(conn.sock)
	doc.broadcast(conn.Id(), doc.srv.Rev(), outops)
}

func (conn *Connection) cleanupSubs() {
	// Remove this connection's subscriptions from their documents.
	for _, doc := range conn.subs {
		doc.removeSub(conn.Id())
	}
	// Don't bother clearing conn.subs, because it won't be reused
}

func SockHandler(sock sockjs.Session) {
	log.Printf("new connection: %s", sock.ID())

	var conn *Connection
	var err error
	for {
		var msg string
		if msg, err = sock.Recv(); err == nil {
			var req Req
			err := json.NewDecoder(strings.NewReader(msg)).Decode(&req)
			if err != nil {
				log.Printf("failed to parse req: %s", err)
				break
			}

			switch req.Type {
			case MsgLogin:
				userId := req.Login.UserId
				user := users[userId]
				if user == nil {
					ErrorRsp{ Msg: fmt.Sprintf("Invalid user id: %s", userId) }.Send(sock)
				} else {
					conn = makeConnection(user, sock)
					LoginRsp{UserId: req.Login.UserId, ConnId: conn.Id()}.Send(sock)
				}

			case MsgSubscribe:
				if conn.validate(sock) {
					conn.handleSubscribe(req.Subscribe)
				}

			case MsgRevise:
				if conn.validate(sock) {
					conn.handleRevise(req.Revise)
				}
			}

			continue
		}
		break
	}

	if conn != nil {
		conn.cleanupSubs()
	}

	log.Printf("lost connection %s: %s", sock.ID(), err)
}
