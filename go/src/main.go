package main

import (
	"net/http"
	"log"
	_ "onde" // Other handlers and initialization are done in onde's init().
)

func main() {
	http.Handle("/", http.FileServer(http.Dir("pub")))
	log.Fatal(http.ListenAndServe(":8080", nil))
}
