package search

import (
	"fmt"
	"log"
	"net/url"
	"time"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"onde/solr"
	. "onde/api"
)

var searches = make(map[string]*Search)

type Search struct {
	query string
	subs  map[string]sockjs.Session
	done  bool
}

func Subscribe(query string, connId string, sock sockjs.Session) (*Search, error) {
	// TODO: lock to avoid getting multiple copies of the same search
	s, exists := searches[query]
	if !exists {
		s = &Search{
			query: query,
			subs:  make(map[string]sockjs.Session),
		}
		searches[query] = s

		go s.loop()
	}

	s.subs[connId] = sock
	log.Printf("[%d] sub search %s: %s", len(s.subs), query, connId)
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

		// TODO: This keeps us from searching solr too frequently, but we need a special case for new subscriptions
		// (otherwise, the *second* sub to a search query waits before sending results).
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
	for _, sock := range s.subs {
		rsp.Send(sock)
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
