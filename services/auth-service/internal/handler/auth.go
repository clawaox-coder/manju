// Package handler 把 HTTP 请求映射到 service.Auth 上, 输出 api.md §3 风格的 JSON.

package handler

import (
	"net/http"
	"net/netip"

	"github.com/manju-org/manju/services/auth-service/internal/httpx"
	"github.com/manju-org/manju/services/auth-service/internal/middleware"
	"github.com/manju-org/manju/services/auth-service/internal/repo/db"
	"github.com/manju-org/manju/services/auth-service/internal/service"
)

type Auth struct {
	Svc *service.Auth
}

// ---- DTOs ----

type userDTO struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatar_url"`
	Bio       *string `json:"bio"`
	Phone     *string `json:"phone"`
}

type teamDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Plan string `json:"plan"`
	Role string `json:"role"`
}

type tokenPairDTO struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

type sessionResponse struct {
	AccessToken  string  `json:"access_token"`
	RefreshToken string  `json:"refresh_token"`
	ExpiresIn    int     `json:"expires_in"`
	User         userDTO `json:"user"`
	Team         teamDTO `json:"team"`
}

func toUserDTO(u db.User) userDTO {
	return userDTO{
		ID:        u.ID.String(),
		Email:     u.Email,
		Name:      u.Name,
		AvatarURL: u.AvatarURL,
		Bio:       u.Bio,
		Phone:     u.Phone,
	}
}

func toTeamDTO(t db.Team, role db.TeamRole) teamDTO {
	return teamDTO{
		ID:   t.ID.String(),
		Name: t.Name,
		Plan: string(t.Plan),
		Role: string(role),
	}
}

func toSessionResponse(ident service.Identity, pair service.TokenPair) sessionResponse {
	return sessionResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		User:         toUserDTO(ident.User),
		Team:         toTeamDTO(ident.Team, ident.Role),
	}
}

// ---- helpers ----

func clientInfoFrom(r *http.Request) service.ClientInfo {
	ipStr := middleware.KeyByIP(r)
	var ipPtr *netip.Addr
	if ipStr != "" {
		if addr, err := netip.ParseAddr(ipStr); err == nil {
			ipPtr = &addr
		}
	}
	return service.ClientInfo{
		IP:        ipPtr,
		UserAgent: r.UserAgent(),
		DeviceID:  r.Header.Get("X-Device-Id"),
	}
}

// ---- endpoints ----

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

func (h *Auth) Register(w http.ResponseWriter, r *http.Request) {
	var body registerReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	ident, pair, err := h.Svc.Register(r.Context(), body.Email, body.Password, body.Name, clientInfoFrom(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusCreated, toSessionResponse(ident, pair))
}

type loginReq struct {
	Email    string  `json:"email"`
	Password string  `json:"password"`
	TOTP     *string `json:"totp,omitempty"`
}

func (h *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var body loginReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	// TOTP 暂未实现 (2fa 在 m1+).
	_ = body.TOTP
	ident, pair, err := h.Svc.Login(r.Context(), body.Email, body.Password, clientInfoFrom(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, toSessionResponse(ident, pair))
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

type refreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (h *Auth) Refresh(w http.ResponseWriter, r *http.Request) {
	var body refreshReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	_, pair, err := h.Svc.Refresh(r.Context(), body.RefreshToken, clientInfoFrom(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, refreshResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
	})
}

type logoutReq struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	var body logoutReq
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.Svc.Logout(r.Context(), body.RefreshToken); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, map[string]any{"ok": true})
}
