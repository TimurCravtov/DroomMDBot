package transit

import (
	"strings"
	"unicode"
)

const (
	maxRouteResults = 60
	maxStopResults  = 40
)

// Words (EN/RO) that select a vehicle type, matched by prefix.
var typeAliases = map[string][]string{
	"trolleybus": {"trolleybus", "troleibuz"},
	"bus":        {"bus", "autobuz"},
	"minibus":    {"minibus", "microbuz", "rutiera"},
}

var diacritics = strings.NewReplacer(
	"ă", "a", "â", "a", "î", "i", "ș", "s", "ş", "s", "ț", "t", "ţ", "t",
)

// normalize lowercases and strips Romanian diacritics so "piata" matches "Piața".
func normalize(s string) string {
	return diacritics.Replace(strings.ToLower(s))
}

// tolerance is how many typos a query word may contain: none for short words, where
// one slip would match half the alphabet.
func tolerance(word string) int {
	switch n := len([]rune(word)); {
	case n >= 7:
		return 2
	case n >= 4:
		return 1
	default:
		return 0
	}
}

// editDistance is the Levenshtein distance between two strings, counted in runes.
func editDistance(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	cur := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	return prev[len(rb)]
}

// nameHas reports whether a (normalized) name contains the word, exactly or, when
// fuzzy, with a few typos: the word may be a slightly misspelled start of one of the
// name's words ("hancesti" for "hincesti", "cntral" for "central").
func nameHas(name string, word string, fuzzy bool) bool {
	if strings.Contains(name, word) {
		return true
	}
	tol := tolerance(word)
	if !fuzzy || tol == 0 {
		return false
	}
	w := []rune(word)
	for _, token := range strings.FieldsFunc(name, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		t := []rune(token)
		if editDistance(word, token) <= tol {
			return true
		}
		if len(t) > len(w) && editDistance(word, string(t[:len(w)])) <= tol {
			return true // a misspelled beginning of a longer word
		}
	}
	return false
}

// routeMatches requires every word of the query to hit the route's number (prefix),
// its name (substring) or its vehicle type (prefix of a type word).
func routeMatches(r Route, words []string, fuzzy bool) bool {
	name := normalize(r.Name)
	for _, w := range words {
		ok := strings.HasPrefix(r.Number, w) || nameHas(name, w, fuzzy)
		if !ok {
			for _, alias := range typeAliases[r.Type] {
				if strings.HasPrefix(alias, w) {
					ok = true
					break
				}
			}
		}
		if !ok {
			return false
		}
	}
	return true
}

// Search finds routes by number, name or vehicle type, and stops by name.
func (d *Dataset) Search(query string) SearchResults {
	res := SearchResults{Routes: []Route{}, Stops: []StopResult{}, Places: []struct{}{}}
	words := strings.Fields(normalize(query))
	if len(words) == 0 {
		return res
	}

	// Exact matches first; misspelled ones follow so typos still find something.
	seenRoute := map[string]bool{}
	for _, fuzzy := range []bool{false, true} {
		for _, r := range d.Routes {
			if len(res.Routes) == maxRouteResults {
				break
			}
			if !seenRoute[r.ID] && routeMatches(r, words, fuzzy) {
				seenRoute[r.ID] = true
				res.Routes = append(res.Routes, r)
			}
		}
	}

	seenStop := map[string]bool{}
	for _, fuzzy := range []bool{false, true} {
		for _, s := range d.Stops {
			if len(res.Stops) == maxStopResults {
				break
			}
			if seenStop[s.ID] {
				continue
			}
			name := normalize(s.Name)
			match := true
			for _, w := range words {
				if !nameHas(name, w, fuzzy) {
					match = false
					break
				}
			}
			if match {
				seenStop[s.ID] = true
				numbers := d.stopRoutes[s.ID]
				if numbers == nil {
					numbers = []string{}
				}
				res.Stops = append(res.Stops, StopResult{Stop: s, RouteNumbers: numbers})
			}
		}
	}
	return res
}
