package card

import (
	"fmt"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	. "onde/api"
	"onde/ot"
	"onde/solr"
	"strconv"
	"strings"
	"onde/api"
	"hash/fnv"
	"time"
	"encoding/base64"
	"bytes"
	"encoding/binary"
)

var master struct {
	cards   map[string]*Card
	subs   chan subReq
	unsubs chan unsubReq
}

type subReq struct {
	cardId    string
	connId   string
	subId    int
	sock     sockjs.Session
	response chan<- *Card
}

type unsubReq struct {
	card    *Card
	connId string
	subId  int
}

func init() {
	master.cards = make(map[string]*Card)
	master.subs = make(chan subReq)
	master.unsubs = make(chan unsubReq)
	go run()
}

// Main card subscription loop. Controls access to Card structs via the un[subs] channels.
func run() {
	done := make(chan *Card)

	for {
		select {
		case req := <-master.subs:
			card, exists := master.cards[req.cardId]
			if !exists {
				var err error
				card, err = newCard(req.cardId, done)
				if err != nil {
					// TODO: something.
					continue
				}
				master.cards[req.cardId] = card
			}
			card.subs <- req
			req.response <- card
			log.Printf("%d cards total", len(master.cards))

		case req := <-master.unsubs:
			req.card.unsubs <- req

		case card := <-done:
			delete(master.cards, card.id)
			log.Printf("%d cards total", len(master.cards))
		}
	}
}

type Card struct {
	id            string
	props         map[string]*ot.Doc
	history       []api.Change
	subscriptions map[string]sockjs.Session
	subs          chan subReq
	unsubs        chan unsubReq
	updates       chan cardUpdate
}

type cardUpdate struct {
	connId string
	subId  int
	rev    int
	change api.Change
}

func newCard(cardId string, done chan<- *Card) (*Card, error) {
	card := &Card{
		id:            cardId,
		props:         make(map[string]*ot.Doc),
		history:       make([]api.Change, 0),
		subscriptions: make(map[string]sockjs.Session),
		subs:          make(chan subReq),
		unsubs:        make(chan unsubReq),
		updates:       make(chan cardUpdate), // TODO: consider increasing channel size
	}

	// TODO: I don't like the way we're dealing with JsonObject here.
	// Consider ditching it and just keeping its little 'get-walker' as a helper func.
	solrDoc, err := solr.GetDoc("onde", cardId)
	if err != nil {
		return nil, err
	}
	solrMap := map[string]interface{}(solrDoc)
	for k, v := range solrMap {
		if strings.HasPrefix(k, "prop_") {
			card.props[k[5:]] = ot.NewDoc(v.(string))
		}
	}

	go card.run(done)
	return card, nil
}

// Creates a new, empty card.
func Create(connId string, props map[string]string) (cardId string, err error) {
	// Create a 64-bit cardid by hashing a combination of the connection id and the unix epoch time in nanos.
	// Hopefully this is good enough to make collisions extremely unlikely. I really don't want super-long ids.
	h := fnv.New64a()
	h.Write([]byte(connId))
	cardIdInt := h.Sum64() ^ uint64(time.Now().UnixNano())
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, cardIdInt)
	cardIdBuf := &bytes.Buffer{}
	base64.NewEncoder(base64.StdEncoding, cardIdBuf).Write(buf)
	cardId = cardIdBuf.String()

	newProps := make(map[string]*ot.Doc)
	for k, v := range props {
		newProps[k] = ot.NewDoc(v)
	}

	if err = solr.UpdateDoc("onde", cardId, newProps, true); err != nil {
		return "", err
	}

	return
}

// Subscribes to a card, potentially loading it.
func Subscribe(cardId string, connId string, subId int, sock sockjs.Session) (*Card, error) {
	rsp := make(chan *Card)
	master.subs <- subReq{cardId: cardId, connId: connId, subId: subId, sock: sock, response: rsp}
	return <-rsp, nil
}

// Receives a change, transforms and applies it, returning the transformed change.
// Sending the updated change to connected clients is the caller's responsibility.
func (card *Card) Recv(rev int, change api.Change) (api.Change, error) {
	if rev < 0 || len(card.history) < rev {
		return api.Change{}, fmt.Errorf("Revision not in history")
	}

	var err error
	outops := change.Ops

	// Transform ops against all operations that happened since rev.
	for _, other := range card.history[rev:] {
		if other.Prop == change.Prop {
			if outops, _, err = ot.Transform(change.Ops, other.Ops); err != nil {
				return api.Change{}, err
			}
		}
	}

	// Get the propery's card, initializing it if absent.
	// TODO: Should we delete card entries when they become empty, or only do it during serialization?
	prop, exists := card.props[change.Prop]
	if !exists {
		prop = ot.NewDoc("")
		card.props[change.Prop] = prop
	}

	// Apply to card.
	if err = prop.Apply(change.Ops); err != nil {
		return api.Change{}, err
	}
	card.history = append(card.history, change)
	return api.Change{Prop: change.Prop, Ops: outops}, nil
}

// Gets the current card revision.
func (card *Card) Rev() int {
	return len(card.history)
}

// Gets the card's id.
func (card *Card) Id() string {
	return card.id
}

// Gets all the card's properties as strings.
func (card *Card) Props() map[string]string {
	var props = make(map[string]string)
	for k, v := range card.props {
		props[k] = v.String()
	}
	return props
}

// Unsubscribes a connection from the card.
func (card *Card) Unsubscribe(connId string, subId int) {
	master.unsubs <- unsubReq{card: card, connId: connId, subId: subId}
	log.Printf("[%d] unsub card %s: %s/%d", len(card.subscriptions), card.id, connId, subId)
}

// Revise a card. Its goroutine will ensure that the resulting ops
// are broadcast to all subscribers.
func (card *Card) Revise(connId string, subId int, rev int, change api.Change) {
	card.updates <- cardUpdate{connId: connId, subId: subId, rev: rev, change: change}
}

// Main loop for each open Card. Maintains access to subscriptions via the subs/unsubs channels.
func (card *Card) run(done chan<- *Card) {
	for {
		select {
		case req := <-card.subs:
			card.subscriptions[subKey(req.connId, req.subId)] = req.sock
			log.Printf("[%d] sub card %s: %s", len(card.subs), req.cardId, req.connId)

		case req := <-card.unsubs:
			delete(card.subscriptions, subKey(req.connId, req.subId))
			if len(card.subscriptions) == 0 {
				log.Printf("dropping card %s: %s", card.id, req.connId)
				done <- card
				return
			}
			log.Printf("[%d] unsub card %s: %s", len(card.subs), card.id, req.connId)

		case update := <-card.updates:
			outchange, err := card.Recv(update.rev, update.change)
			if err != nil {
				log.Printf("error applying ops to card %s: %s", card.id, err)
				return
			}
			card.broadcast(update, outchange)
			err = card.persist() // TODO: Persist less aggressively.
			if err != nil {
				log.Printf("error persisting card: %s", err.Error())
			}
		}
	}
}

func (card *Card) broadcast(update cardUpdate, change api.Change) {
	rsp := ReviseRsp{
		OrigConnId: update.connId,
		OrigSubId:  update.subId,
		Rev:        update.rev,
		CardId:      card.id,
		Change:     change,
	}
	socks := make(map[sockjs.Session][]int)
	for key, sock := range card.subscriptions {
		socks[sock] = append(socks[sock], connIdFromKey(key))
	}
	for sock, _ := range socks {
		rsp.SubIds = socks[sock]
		rsp.Send(sock)
	}
}

func (card *Card) persist() error {
	return solr.UpdateDoc("onde", card.id, card.props, true)
}

func subKey(connId string, subId int) string {
	return fmt.Sprintf("%s:%d", connId, subId)
}

func connIdFromKey(key string) int {
	parts := strings.Split(key, ":")
	subId, _ := strconv.ParseInt(parts[1], 10, 32)
	return int(subId)
}
