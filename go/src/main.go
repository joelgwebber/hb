package main

import (
	"net/http"
	"log"
	_ "onde" // Other handlers and initialization are done in onde's init().
)

func serveUi(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "pub/ui.html")
}

func main() {
	http.Handle("/", http.FileServer(http.Dir("pub")))
	http.Handle("/ui", http.HandlerFunc(serveUi))
	http.Handle("/ui/", http.HandlerFunc(serveUi))
	log.Fatal(http.ListenAndServe("127.0.0.1:8080", nil))
}
