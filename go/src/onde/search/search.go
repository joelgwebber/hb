package search

import (
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	"net/url"
	. "onde/api"
	"onde/solr"
	"time"
)

var master struct {
	searches map[string]*Search
	subs     chan subReq
	unsubs   chan unsubReq
}

type subReq struct {
	query    string
	connId   string
	sock     sockjs.Session
	response chan<- *Search
}

type unsubReq struct {
	search *Search
	connId string
}

func init() {
	master.searches = make(map[string]*Search)
	master.subs = make(chan subReq)
	master.unsubs = make(chan unsubReq)
	go run()
}

// Main search subscription loop. Controls access to Search structs via the un[subs] channels.
func run() {
	done := make(chan *Search)

	for {
		select {
		case req := <-master.subs:
			s, exists := master.searches[req.query]
			if !exists {
				s = newSearch(req.query, done)
				master.searches[req.query] = s
			}
			s.subs <- req
			req.response <- s
			log.Printf("%d searches total", len(master.searches))

		case req := <-master.unsubs:
			req.search.unsubs <- req

		case s := <-done:
			delete(master.searches, s.query)
			log.Printf("%d searches total", len(master.searches))
		}
	}
}

// Subscribes to a search query.
func Subscribe(query string, connId string, sock sockjs.Session) (*Search, error) {
	rsp := make(chan *Search)
	master.subs <- subReq{query: query, connId: connId, sock: sock, response: rsp}
	return <-rsp, nil
}

// Represents a search query. Get these by calling Subscribe().
type Search struct {
	query         string
	subscriptions map[string]sockjs.Session
	subs          chan subReq
	unsubs        chan unsubReq
	rsp           *SearchResultsRsp
}

func newSearch(query string, done chan<- *Search) *Search {
	s := &Search{
		query:         query,
		subscriptions: make(map[string]sockjs.Session),
		subs:          make(chan subReq),
		unsubs:        make(chan unsubReq),
	}
	go s.run(done)
	return s
}

// Main loop for each running search. Maintains access to subscriptions via the subs/unsubs channels.
func (s *Search) run(done chan<- *Search) {
	for {
		select {
		case req := <-s.subs:
			s.subscriptions[req.connId] = req.sock
			s.update()
			s.send(req.sock)
			log.Printf("[%d] sub search %s: %s", len(s.subs), req.query, req.connId)

		case req := <-s.unsubs:
			delete(s.subscriptions, req.connId)
			if len(s.subscriptions) == 0 {
				log.Printf("dropping search %s: %s", s.query, req.connId)
				done <- s
				return
			}
			log.Printf("[%d] unsub search %s: %s", len(s.subs), s.query, req.connId)

		case <-time.After(5 * time.Second):
			s.update()
			s.broadcast()
		}
	}
}

// Unsubscribe a connection from this Search.
func (s *Search) Unsubscribe(connId string) {
	master.unsubs <- unsubReq{search: s, connId: connId}
}

func (s *Search) update() {
	// TODO: Basic optimization: Don't requery unless *something* has changed.
	total, results, err := solr.GetDocs("onde", url.Values{"q": []string{s.query}})
	if err != nil {
		log.Printf("error retrieving docs for search %s : %s", s.query, err)
	}

	s.rsp = &SearchResultsRsp{
		Query:   s.query,
		Total:   total,
		Results: makeResults(results),
	}
}

func (s *Search) broadcast() {
	for _, sock := range s.subscriptions {
		s.send(sock)
	}
}

func (s *Search) send(sock sockjs.Session) {
	s.rsp.Send(sock)
}

func makeResults(in []solr.JsonObject) []SearchResult {
	results := make([]SearchResult, len(in))
	for i, js := range in {
		results[i] = SearchResult{
			DocId: *js.GetString("id"),
		}
		title := js.GetString("prop_title")
		if title != nil {
			results[i].Title = *title
		}
		body := js.GetString("prop_body")
		if body != nil {
			results[i].Body = *body
		}
	}
	return results
}
