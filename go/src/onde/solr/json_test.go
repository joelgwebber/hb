package solr

import (
	"testing"
	"strings"
	"fmt"
)

const basicTypes = `{ "int": 42, "float": 6.28, "string": "wut", "bool": true }`
func TestBasicTypes(t *testing.T) {
	js, _ := ParseJson(strings.NewReader(basicTypes))
	if *js.GetNumber("int") != 42 || *js.GetNumber("float") != 6.28 || *js.GetString("string") != "wut" || *js.GetBool("bool") != true {
		t.Fail()
	}
}

const nestedTypes = `{ "foo": { "bar": { "baz": 42 } } }"}`
func TestNestedTypes(t *testing.T) {
	js, _ := ParseJson(strings.NewReader(nestedTypes))
	if *js.GetNumber("foo.bar.baz") != 42 {
		t.Fail()
	}
}

const arrays = `{ "foo": [ { "toto": 42 }, { "tintin": 54 } ] }`
func TestArrays(t *testing.T) {
	js, _ := ParseJson(strings.NewReader(arrays))
	if *js.GetNumber("foo.1.tintin") != 54 {
		t.Fail()
	}
}

const getArray = `{ "foo": [42, 54], "bar": ["wat", true] }`
func TestGetArray(t *testing.T) {
	js, _ := ParseJson(strings.NewReader(getArray))
	arr := js.GetArray("foo")
	if arr[0] != 42.0 {
		t.Fail()
	}

	arr = js.GetArray("bar")
	if arr[0] != "wat" {
		t.Fail()
	}
}
