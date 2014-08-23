package onde

import (
	"encoding/json"
	"fmt"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	"strings"
)

type Connection struct {
	user    *User
	sock    sockjs.Session
	docSubs map[string]*Document // docId -> Document
}

func makeConnection(user *User, sock sockjs.Session) *Connection {
	return &Connection{
		user:    user,
		sock:    sock,
		docSubs: make(map[string]*Document),
	}
}

func (conn *Connection) Id() string {
	return conn.sock.ID()
}

func (conn *Connection) validate(sock sockjs.Session) bool {
	if conn == nil {
		ErrorRsp{Msg: "no connection"}.Send(sock)
		return false
	}
	return true
}

func (conn *Connection) handleSubscribeDoc(req *SubscribeDocReq) {
	if _, exists := conn.docSubs[req.DocId]; exists {
		ErrorRsp{Msg: fmt.Sprintf("double subscribe: %s", req.DocId)}.Send(conn.sock)
		return
	}

	doc, err := SubscribeDoc(req.DocId, conn)
	if err != nil {
		ErrorRsp{Msg: fmt.Sprintf("no such document: %s", req.DocId)}.Send(conn.sock)
		return
	}

	conn.docSubs[req.DocId] = doc
	SubscribeDocRsp{
		DocId: req.DocId,
		Rev:   doc.srv.Rev(),
		Doc:   string(*doc.srv.Doc),
	}.Send(conn.sock)
}

func (conn *Connection) handleUnsubscribeDoc(req *UnsubscribeDocReq) {
	doc, exists := conn.docSubs[req.DocId]
	if !exists {
		ErrorRsp{Msg: fmt.Sprintf("error unsubscribing doc %s: no subscription found", req.DocId)}.Send(conn.sock)
		return
	}

	doc.Unsubscribe(conn.Id())
	UnsubscribeDocRsp{DocId: req.DocId}.Send(conn.sock)
}

func (conn *Connection) handleRevise(req *ReviseReq) {
	doc, exists := conn.docSubs[req.DocId]
	if !exists {
		ErrorRsp{Msg: fmt.Sprintf("error revising document %s - not subscribed", req.DocId)}.Send(conn.sock)
		return
	}
	doc.Revise(req.ConnId, req.Rev, req.Ops) // will send ReviseRsp from doc's goroutine
}

func (conn *Connection) cleanupSubs() {
	// Remove this connection's subscriptions from their documents.
	// Don't bother clearing conn.docSubs, because it won't be reused
	for _, doc := range conn.docSubs {
		doc.Unsubscribe(conn.Id())
	}
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
					ErrorRsp{Msg: fmt.Sprintf("Invalid user id: %s", userId)}.Send(sock)
				} else {
					conn = makeConnection(user, sock)
					LoginRsp{UserId: req.Login.UserId, ConnId: conn.Id()}.Send(sock)
				}

			case MsgSubscribeDoc:
				if conn.validate(sock) {
					conn.handleSubscribeDoc(req.SubscribeDoc)
				}

			case MsgUnsubscribeDoc:
				if conn.validate(sock) {
					conn.handleUnsubscribeDoc(req.UnsubscribeDoc)
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
