package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"droommd/server/internal/store"
)

// maxCollectionBody bounds a request body; a collection is a name and a few route ids.
const maxCollectionBody = 8 << 10

func (s *Server) listCollections(w http.ResponseWriter, r *http.Request) {
	user := userID(r)
	if err := s.store.Touch(r.Context(), user); err != nil {
		log.Printf("storage: touching %s: %v", user, err)
		writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	collections, err := s.store.Collections(r.Context(), user)
	if err != nil {
		log.Printf("storage: listing collections of %s: %v", user, err)
		writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	writeJSON(w, http.StatusOK, collections)
}

func decodeCollection(w http.ResponseWriter, r *http.Request) (store.Collection, bool) {
	var in store.Collection
	body := http.MaxBytesReader(w, r.Body, maxCollectionBody)
	if err := json.NewDecoder(body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be a collection as JSON")
		return in, false
	}
	return in, true
}

func (s *Server) saveCollection(w http.ResponseWriter, r *http.Request) {
	in, ok := decodeCollection(w, r)
	if !ok {
		return
	}
	in.ID = "" // ids are assigned by the server

	saved, err := s.store.SaveCollection(r.Context(), userID(r), in)
	switch {
	case errors.Is(err, store.ErrInvalid):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, store.ErrCollectionLimit):
		writeError(w, http.StatusConflict, err.Error())
	case err != nil:
		log.Printf("storage: saving collection for %s: %v", userID(r), err)
		writeError(w, http.StatusInternalServerError, "storage error")
	default:
		writeJSON(w, http.StatusCreated, saved)
	}
}

func (s *Server) updateCollection(w http.ResponseWriter, r *http.Request) {
	in, ok := decodeCollection(w, r)
	if !ok {
		return
	}
	in.ID = r.PathValue("id")

	saved, found, err := s.store.UpdateCollection(r.Context(), userID(r), in)
	switch {
	case errors.Is(err, store.ErrInvalid):
		writeError(w, http.StatusBadRequest, err.Error())
	case err != nil:
		log.Printf("storage: updating collection for %s: %v", userID(r), err)
		writeError(w, http.StatusInternalServerError, "storage error")
	case !found:
		writeError(w, http.StatusNotFound, "no such collection")
	default:
		writeJSON(w, http.StatusOK, saved)
	}
}

func (s *Server) deleteCollection(w http.ResponseWriter, r *http.Request) {
	removed, err := s.store.DeleteCollection(r.Context(), userID(r), r.PathValue("id"))
	switch {
	case err != nil:
		log.Printf("storage: deleting collection for %s: %v", userID(r), err)
		writeError(w, http.StatusInternalServerError, "storage error")
	case !removed:
		writeError(w, http.StatusNotFound, "no such collection")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
