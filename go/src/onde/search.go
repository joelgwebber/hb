package onde

import (
	"fmt"
	"log"
	"net/url"
	"onde/solr"
	"time"
)

var searches = make(map[string]*Search)

type Search struct {
	query string
	subs  map[string]*Connection
	done  bool
}

func SubscribeSearch(query string, conn *Connection) (*Search, error) {
	// TODO: lock to avoid getting multiple copies of the same search
	s, exists := searches[query]
	if !exists {
		s = &Search{
			query: query,
			subs:  make(map[string]*Connection),
		}
		searches[query] = s

		go s.loop()
	}

	s.subs[conn.Id()] = conn
	log.Printf("[%d] sub search %s: %s", len(s.subs), query, conn.Id())
	return s, nil
}

func (s *Search) loop() {
	for ; !s.done; {
		// TODO: Basic optimization: Don't requery unless *something* has changed.
		total, results, err := solr.GetDocs("onde", url.Values{"q": []string{fmt.Sprintf("body:%s", s.query)}})
		if err != nil {
			log.Printf("error retrieving docs for search %s : %s", s.query, err)
		}

		// TODO: Find some way to avoid sending duplicate results.
		rsp := &SearchResultsRsp{
			Query:   s.query,
			Total:   total,
			Results: makeResults(results),
		}
		s.broadcast(rsp)

		<-time.After(5 * time.Second)
	}
}

func (s *Search) Unsubscribe(connId string) {
	// TODO: Make sure this is actually threadsafe. Probably isn't.
	delete(s.subs, connId)

	log.Printf("[%d] unsub search %s: %s", len(s.subs), s.query, connId)

	// Drop search (and terminate goroutine) when subscriptions reach zero.
	if len(s.subs) == 0 {
		delete(searches, s.query)
		s.done = true
	}
}

func (s *Search) broadcast(rsp *SearchResultsRsp) {
	for _, conn := range s.subs {
		rsp.Send(conn.sock)
	}
}

func makeResults(in []solr.JsonObject) []SearchResult {
	results := make([]SearchResult, len(in))
	for i, js := range in {
		results[i] = SearchResult{
			DocId: *js.GetString("id"),
			Body:  *js.GetString("body"),
		}
	}
	return results
}
