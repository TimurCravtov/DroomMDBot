package transit

import "strings"

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

// routeMatches requires every word of the query to hit the route's number (prefix),
// its name (substring) or its vehicle type (prefix of a type word).
func routeMatches(r Route, words []string) bool {
	name := normalize(r.Name)
	for _, w := range words {
		ok := strings.HasPrefix(r.Number, w) || strings.Contains(name, w)
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

	for _, r := range d.Routes {
		if routeMatches(r, words) {
			res.Routes = append(res.Routes, r)
			if len(res.Routes) == maxRouteResults {
				break
			}
		}
	}
	for _, s := range d.Stops {
		name := normalize(s.Name)
		match := true
		for _, w := range words {
			if !strings.Contains(name, w) {
				match = false
				break
			}
		}
		if match {
			numbers := d.stopRoutes[s.ID]
			if numbers == nil {
				numbers = []string{}
			}
			res.Stops = append(res.Stops, StopResult{Stop: s, RouteNumbers: numbers})
			if len(res.Stops) == maxStopResults {
				break
			}
		}
	}
	return res
}
