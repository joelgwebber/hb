package onde

import "onde/ot"

type Document struct {
	id   string
	srv  *ot.Server
	subs map[string]*Connection
}

func makeDoc(docId, text string) {
	bytes := []byte(text)
	doc := &Document{
		id:   docId,
		srv:  &ot.Server{ Doc: (*ot.Doc)(&bytes) },
		subs: make(map[string]*Connection),
	}
	docs[docId] = doc
}

func (doc *Document) broadcast(connId string, rev int, ops ot.Ops) {
	for recvId, conn := range doc.subs {
		if recvId != connId {
			ReviseRsp{
				ConnId: connId,
				Rev:    rev,
				Ops:    ops,
			}.Send(conn.sock)
		}
	}
}

func (doc *Document) addSub(conn *Connection) {
	doc.subs[conn.Id()] = conn
}

func (doc *Document) removeSub(connId string) {
	delete(doc.subs, connId)
}

var docs = make(map[string]*Document)

type User struct {
	id string
}

func makeUser(id string) {
	users[id] = &User{
		id: id,
	}
}

var users = make(map[string]*User)

func init() {
	makeUser("joel")
	makeUser("anais")

	makeDoc("foo", "Here's the foo doc.")
	makeDoc("bar", "Here's the bar doc.")
}
