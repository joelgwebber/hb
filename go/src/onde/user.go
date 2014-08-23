package onde

var users = make(map[string]*User)

type User struct {
	id string
}

func makeUser(id string) {
	users[id] = &User{
		id: id,
	}
}
