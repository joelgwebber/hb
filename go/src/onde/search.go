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
	return s, nil
}

func (s *Search) loop() {
	for {
		<-time.After(5 * time.Second)

		total, results, err := solr.GetDocs("onde", url.Values{"q": []string{fmt.Sprintf("body:%s", s.query)}})
		if err != nil {
			log.Printf("error retrieving docs for search %s : %s", s.query, err)
		}

		rsp := &SearchResultsRsp{
			Total:   total,
			Results: makeResults(results),
		}
		s.broadcast(rsp)
	}
}

func (s *Search) Unsubscribe(connId string) {
	// TODO: drop search (and terminate goroutine when subscriptions reach zero.
	delete(s.subs, connId)
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
			Doc:   *js.GetString("body"),
		}
	}
	return results
}
