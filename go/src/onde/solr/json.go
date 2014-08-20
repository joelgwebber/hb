package solr

import (
	"strings"
	"io"
	"encoding/json"
	"strconv"
)

type JsonObject map[string]interface{}

func (js JsonObject) GetString(key string) *string {
	val := js.get(key)
	switch x := val.(type) {
	case string:
		return &x
	default:
		return nil
	}
}

func (js JsonObject) GetBool(key string) *bool {
	val := js.get(key)
	switch x := val.(type) {
	case bool:
		return &x
	default:
		return nil
	}
}

func (js JsonObject) GetNumber(key string) *float64 {
	val := js.get(key)
	switch x := val.(type) {
	case float64:
		return &x
	default:
		return nil
	}
}

func (js JsonObject) GetArray(key string) []interface{} {
	val := js.get(key)
	switch x := val.(type) {
	case []interface{}:
		return x
	default:
		return nil
	}
}

func ParseJson(r io.Reader) (JsonObject, error) {
	var js JsonObject
	err := json.NewDecoder(r).Decode(&js); if err != nil {
		return nil, err
	}
	return js, nil
}

func (js JsonObject) get(key string) interface{} {
	parts := strings.Split(key, ".")
	cur := interface{}(map[string]interface{}(js))
	for i, part := range parts {
		switch obj := cur.(type) {
		case map[string]interface{}:
			var exists bool
			if cur, exists = obj[part]; !exists {
				return nil
			}
		case []interface{}:
			idx, err := strconv.ParseInt(part, 10, 32)
			if err != nil || idx < 0 || int(idx) >= len(obj) {
				return nil
			}
			cur = obj[idx]
		}
		if i == len(parts)-1 {
			return cur
		}
	}
	return nil
}
