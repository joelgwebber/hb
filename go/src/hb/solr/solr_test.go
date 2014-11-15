package solr

import (
	"fmt"
	"strconv"
	"testing"
)

const doc0 = `{
foo:bar
}`

const doc1 = `
{
foo:bar
toto:tintin
baz:42
}
This is the actual body text.`

func TestExtractProperties0(t *testing.T) {
	props, body := extractProperties(doc0)
	checkMap(map[string]string{"foo": "bar"}, props, t)
	if body != "" {
		t.Fail()
	}
}

func TestExtractProperties1(t *testing.T) {
	props, body := extractProperties(doc1)
	printMap(props)
	checkMap(map[string]string{
		"foo":  "bar",
		"toto": "tintin",
		"baz":  "42",
	}, props, t)
	if body != "This is the actual body text." { // Note the CR after } is stripped.
		t.Fail()
	}
}

func printMap(m map[string]string) {
	for k, v := range m {
		fmt.Printf("%s : %s\n", strconv.Quote(k), strconv.Quote(v))
	}
}

func checkMap(exp map[string]string, act map[string]string, t *testing.T) {
	if len(exp) != len(act) {
		t.Fail()
	}
	for k, v := range exp {
		if act[k] != v {
			t.Fail()
		}
	}
}
