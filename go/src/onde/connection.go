package onde

import (
	"encoding/json"
	"fmt"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	. "onde/api"
	"onde/card"
	"onde/search"
	"strings"
	"onde/solr"
)

type Connection struct {
	user       solr.JsonObject
	sock       sockjs.Session
	cardSubs    map[int]*card.Card // subId -> Card
	searchSubs map[string]*search.Search  // query -> Search
}

func sockHandler(sock sockjs.Session) {
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
				user, err := FindUser(userId)
				if err != nil {
					ErrorRsp{Msg: fmt.Sprintf("Invalid user id: %s", userId)}.Send(sock)
					continue
				}
				pass := user.GetString("prop_pass")
				log.Printf("pass: %v", pass)
				if pass != nil && req.Login.Password != *pass {
					ErrorRsp{Msg: fmt.Sprintf("Incorrect password for user: %s", userId)}.Send(sock)
					continue
				}
				conn = newConnection(user, sock)
				LoginRsp{UserId: req.Login.UserId, ConnId: conn.Id()}.Send(sock)

			case MsgSubscribeCard:
				if conn.validate(sock) {
					conn.handleSubscribeCard(req.SubscribeCard)
				}

			case MsgUnsubscribeCard:
				if conn.validate(sock) {
					conn.handleUnsubscribeCard(req.UnsubscribeCard)
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

			case MsgCreateCard:
				if conn.validate(sock) {
					conn.handleCreateCard(req.CreateCard)
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

func (conn *Connection) handleSubscribeCard(req *SubscribeCardReq) {
	if _, exists := conn.cardSubs[req.SubId]; exists {
		ErrorRsp{Msg: fmt.Sprintf("double subscribe subid %d", req.SubId)}.Send(conn.sock)
		return
	}

	card, err := card.Subscribe(req.CardId, conn.Id(), req.SubId, conn.sock)
	if err != nil {
		ErrorRsp{Msg: fmt.Sprintf("no such card: %s", req.CardId)}.Send(conn.sock)
		return
	}
	conn.cardSubs[req.SubId] = card

	SubscribeCardRsp{
		CardId: req.CardId,
		SubId: req.SubId,
		Rev:   card.Rev(),
		Props: card.Props(),
	}.Send(conn.sock)
}

func (conn *Connection) handleUnsubscribeCard(req *UnsubscribeCardReq) {
	card, exists := conn.cardSubs[req.SubId]
	if !exists {
		ErrorRsp{Msg: fmt.Sprintf("error unsubscribing subid %d: no subscription found", req.SubId)}.Send(conn.sock)
		return
	}

	delete(conn.cardSubs, req.SubId)
	card.Unsubscribe(conn.Id(), req.SubId)
	UnsubscribeCardRsp{SubId: req.SubId}.Send(conn.sock)
}

func (conn *Connection) handleRevise(req *ReviseReq) {
	card, exists := conn.cardSubs[req.SubId]
	if !exists {
		ErrorRsp{Msg: fmt.Sprintf("error revising card %s - not subscribed", req.CardId)}.Send(conn.sock)
		return
	}
	card.Revise(req.ConnId, req.SubId, req.Rev, req.Change)
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

func (conn *Connection) handleCreateCard(req *CreateCardReq) {
	cardId, err := card.Create(conn.Id(), req.Props)
	if err != nil {
		ErrorRsp{Msg: fmt.Sprintf("error creating card: %s", err)}.Send(conn.sock)
		return
	}
	CreateCardRsp{CreateId: req.CreateId, CardId: cardId}.Send(conn.sock)
}

func (conn *Connection) cleanupSubs() {
	// Remove this connection's subscriptions from their cards.
	// Don't bother clearing conn.*Subs, because it won't be reused
	for subId, card := range conn.cardSubs {
		card.Unsubscribe(conn.Id(), subId)
	}
	for _, s := range conn.searchSubs {
		s.Unsubscribe(conn.Id())
	}
}

func newConnection(user solr.JsonObject, sock sockjs.Session) *Connection {
	return &Connection{
		user:       user,
		sock:       sock,
		cardSubs:    make(map[int]*card.Card),
		searchSubs: make(map[string]*search.Search),
	}
}

