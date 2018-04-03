package main

import (
	_ "hb" // Other handlers and initialization are done in hb's init().
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
)

var tmpls *template.Template

func uiServer(tmplName string) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		// Re-read these every time, so we don't have to restart the server to pick up changes.
		frag, err := ioutil.ReadFile("pub/templates.fragment.html")
		if err != nil {
			panic(err)
		}

		uiTemplates := template.HTML(frag)
		err = tmpls.ExecuteTemplate(w, tmplName, template.HTML(uiTemplates))
		if err != nil {
			panic(err)
		}
	}
}

func main() {
	// Parse templates and ui templates.
	var err error
	tmpls, err = template.ParseFiles("pub/ui.html", "pub/card.html")
	if err != nil {
		panic(err)
	}

	// Handlers.
	http.Handle("/", http.FileServer(http.Dir("pub")))
	http.Handle("/ui", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "/ui/")
		w.WriteHeader(http.StatusMovedPermanently)
	}))
	http.Handle("/ui/", http.HandlerFunc(uiServer("ui.html")))
	http.Handle("/card/", http.HandlerFunc(uiServer("card.html")))

	// This blocks until crash.
	log.Fatal(http.ListenAndServe("127.0.0.1:8080", nil))
}
