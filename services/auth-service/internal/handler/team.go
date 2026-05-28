package handler

import (
	"net/http"

	"github.com/manju-org/manju/services/auth-service/internal/httpx"
	"github.com/manju-org/manju/services/auth-service/internal/middleware"
	"github.com/manju-org/manju/services/auth-service/internal/repo/db"
)

type teamMemberDTO struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatar_url"`
	Role      string  `json:"role"`
	JoinedAt  string  `json:"joined_at"`
}

func (h *Auth) TeamMembers(w http.ResponseWriter, r *http.Request) {
	uid := middleware.MustUserID(r.Context())
	ident, err := h.Svc.Me(r.Context(), uid)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	members, err := db.New(h.Pool).ListTeamMembers(r.Context(), ident.Team.ID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	out := make([]teamMemberDTO, 0, len(members))
	for _, m := range members {
		dto := teamMemberDTO{
			ID:        m.ID.String(),
			Email:     m.Email,
			Name:      m.Name,
			AvatarURL: m.AvatarURL,
			Role:      string(m.Role),
			JoinedAt:  m.JoinedAt.Format("2006-01-02T15:04:05Z"),
		}
		out = append(out, dto)
	}
	httpx.WriteJSON(w, r, http.StatusOK, out)
}
