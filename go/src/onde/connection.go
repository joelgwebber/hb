package onde

import (
	"encoding/json"
	"fmt"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	"strings"
	"onde/search"
	. "onde/api"
	"onde/document"
)

type Connection struct {
	user       *User
	sock       sockjs.Session
	docSubs    map[int]*document.Document     // subId -> Document
	searchSubs map[string]*search.Search // query -> Search
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
					conn = newConnection(user, sock)
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

			case MsgSubscribeSearch:
				if conn.validate(sock) {
					conn.handleSubscribeSearch(req.SubscribeSearch)
				}

			case MsgUnsubscribeSearch:
				if conn.validate(sock) {
					conn.handleUnsubscribeSearch(req.UnsubscribeSearch)
				}

			case MsgCreateDoc:
				if conn.validate(sock) {
					conn.handleCreateDoc(req.CreateDoc)
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
	if _, exists := conn.docSubs[req.SubId]; exists {
		ErrorRsp{Msg: fmt.Sprintf("double subscribe subid %d", req.SubId)}.Send(conn.sock)
		return
	}

	doc, err := document.Subscribe(req.DocId, conn.Id(), req.SubId, conn.sock)
	if err != nil {
		ErrorRsp{Msg: fmt.Sprintf("no such document: %s", req.DocId)}.Send(conn.sock)
		return
	}
	conn.docSubs[req.SubId] = doc

	SubscribeDocRsp{
		DocId: req.DocId,
		SubId: req.SubId,
		Rev:   doc.Rev(),
		Body:  doc.Text(),
	}.Send(conn.sock)
}

func (conn *Connection) handleUnsubscribeDoc(req *UnsubscribeDocReq) {
	doc, exists := conn.docSubs[req.SubId]
	if !exists {
		ErrorRsp{Msg: fmt.Sprintf("error unsubscribing subid %d: no subscription found", req.SubId)}.Send(conn.sock)
		return
	}

	delete(conn.docSubs, req.SubId)
	doc.Unsubscribe(conn.Id(), req.SubId)
	UnsubscribeDocRsp{SubId: req.SubId}.Send(conn.sock)
}

func (conn *Connection) handleRevise(req *ReviseReq) {
	doc, exists := conn.docSubs[req.SubId]
	if !exists {
		ErrorRsp{Msg: fmt.Sprintf("error revising document %s - not subscribed", req.DocId)}.Send(conn.sock)
		return
	}
	doc.Revise(req.ConnId, req.SubId, req.Rev, req.Ops)
}

func (conn *Connection) handleSubscribeSearch(req *SubscribeSearchReq) {
	if _, exists := conn.searchSubs[req.Query]; exists {
		ErrorRsp{Msg: fmt.Sprintf("double subscribe: %s", req.Query)}.Send(conn.sock)
		return
	}

	search, err := search.Subscribe(req.Query, conn.Id(), conn.sock)
	if err != nil {
		ErrorRsp{Msg: fmt.Sprintf("unable to subscribe to search: %s", req.Query)}.Send(conn.sock)
		return
	}

	conn.searchSubs[req.Query] = search
	SubscribeSearchRsp{
		Query: req.Query,
	}.Send(conn.sock)
}

func (conn *Connection) handleUnsubscribeSearch(req *UnsubscribeSearchReq) {
	s, exists := conn.searchSubs[req.Query]
	if !exists {
		ErrorRsp{Msg: fmt.Sprintf("error unsubscribing search %s: no subscription found", req.Query)}.Send(conn.sock)
		return
	}

	delete(conn.searchSubs, req.Query)
	s.Unsubscribe(conn.Id())
	UnsubscribeSearchRsp{Query: req.Query}.Send(conn.sock)
}

func (conn *Connection) handleCreateDoc(req *CreateDocReq) {
	docId, err := document.Create()
	if err != nil {
		ErrorRsp{Msg: fmt.Sprintf("error creating document: %s", err)}.Send(conn.sock)
		return
	}
	CreateDocRsp{ CreateId: req.CreateId, DocId: docId }.Send(conn.sock)
}

func (conn *Connection) cleanupSubs() {
	// Remove this connection's subscriptions from their documents.
	// Don't bother clearing conn.*Subs, because it won't be reused
	for subId, doc := range conn.docSubs {
		doc.Unsubscribe(conn.Id(), subId)
	}
	for _, s := range conn.searchSubs {
		s.Unsubscribe(conn.Id())
	}
}

func newConnection(user *User, sock sockjs.Session) *Connection {
	return &Connection{
		user:       user,
		sock:       sock,
		docSubs:    make(map[int]*document.Document),
		searchSubs: make(map[string]*search.Search),
	}
}
