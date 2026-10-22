package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"droommd/server/internal/auth"
	"droommd/server/internal/store"
)

// maxPlaceBody bounds a request body; a place is a few hundred bytes.
const maxPlaceBody = 4 << 10

// userID is the caller verified by auth.Middleware.
func userID(r *http.Request) string {
	id, _ := auth.UserID(r.Context())
	return id
}

func (s *Server) listPlaces(w http.ResponseWriter, r *http.Request) {
	user := userID(r)
	// A user's first request creates their account; later ones record when they were last seen.
	if err := s.store.Touch(r.Context(), user); err != nil {
		log.Printf("storage: touching %s: %v", user, err)
		writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	places, err := s.store.Places(r.Context(), user)
	if err != nil {
		log.Printf("storage: listing places of %s: %v", user, err)
		writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	writeJSON(w, http.StatusOK, places)
}

func (s *Server) savePlace(w http.ResponseWriter, r *http.Request) {
	var in store.Place
	body := http.MaxBytesReader(w, r.Body, maxPlaceBody)
	if err := json.NewDecoder(body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be a place as JSON")
		return
	}
	in.ID = "" // ids are assigned by the server

	saved, err := s.store.SavePlace(r.Context(), userID(r), in)
	switch {
	case errors.Is(err, store.ErrInvalid):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, store.ErrLimit):
		writeError(w, http.StatusConflict, err.Error())
	case err != nil:
		log.Printf("storage: saving place for %s: %v", userID(r), err)
		writeError(w, http.StatusInternalServerError, "storage error")
	default:
		writeJSON(w, http.StatusCreated, saved)
	}
}

func (s *Server) deletePlace(w http.ResponseWriter, r *http.Request) {
	removed, err := s.store.DeletePlace(r.Context(), userID(r), r.PathValue("id"))
	switch {
	case err != nil:
		log.Printf("storage: deleting place for %s: %v", userID(r), err)
		writeError(w, http.StatusInternalServerError, "storage error")
	case !removed:
		// Also the answer for another user's place: nothing to learn about it.
		writeError(w, http.StatusNotFound, "no such place")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// deleteMe erases the caller and everything stored for them.
func (s *Server) deleteMe(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteUser(r.Context(), userID(r)); err != nil {
		log.Printf("storage: deleting user %s: %v", userID(r), err)
		writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
