package handler

import (
	"net/http"

	"github.com/manju-org/manju/services/auth-service/internal/httpx"
	"github.com/manju-org/manju/services/auth-service/internal/middleware"
)

type meResponse struct {
	User userDTO `json:"user"`
	Team teamDTO `json:"team"`
}

func (h *Auth) Me(w http.ResponseWriter, r *http.Request) {
	uid := middleware.MustUserID(r.Context())
	ident, err := h.Svc.Me(r.Context(), uid)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, meResponse{
		User: toUserDTO(ident.User),
		Team: toTeamDTO(ident.Team, ident.Role),
	})
}
