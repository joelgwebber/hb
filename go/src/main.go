package main

import (
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"net/http"
	"log"
	"onde"
)

func main() {
	http.Handle("/sock/", sockjs.NewHandler("/sock", sockjs.DefaultOptions, onde.SockHandler))
	http.Handle("/", http.FileServer(http.Dir("pub")))
	log.Fatal(http.ListenAndServe(":8080", nil))
}
